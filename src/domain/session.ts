// Live collaboration v1 (WG-030, P2P RFC R1 §15): the pure rules. The invite link, the wire messages and their
// parser (the trust boundary for everything a peer sends), which commands a participant may propose, and the host's
// bookkeeping of seats, invites and rates. No clock, no randomness, no crypto: tokens, ids and `nowMs` come in as
// arguments; signatures are checked in src/lib/p2p. The host orders every change; peers replay its commits through the
// same `applyCommand`, so the documents stay identical (the digest proves it).
import { SCHEMA_VERSION } from './model.ts';
import type { Project } from './model.ts';
import type { Command, CommandType } from './commands.ts';

export const COLLAB_PROTOCOL = 1;
/** Largest message a participant may send to the host; snapshots travel only host → participant. */
export const MAX_PEER_MESSAGE = 64 * 1024;
export const MAX_SNAPSHOT_MESSAGE = 5 * 1024 * 1024;
export const MAX_SEATS = 20;
/** Proposals per seat: a bucket of 50 refilled at 10 per second. */
export const RATE_BURST = 50;
export const RATE_PER_SECOND = 10;

// ---- invite link ----

/** 128-bit values as 22 base64url characters: the room secret, the host key fingerprint, an access token. */
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
export const isToken = (value: unknown): value is string => typeof value === 'string' && TOKEN.test(value);

export type Signal = { strategy: 'nostr' } | { strategy: 'relay'; urls: string[] };
export interface Invite {
  signal: Signal;
  /** Shared by everyone with the link; room id and signaling password are derived from it. */
  secret: string;
  /** SHA-256 of the host's public key, truncated to 128 bits: only that host can answer the probe. */
  hostKey: string;
  /** Which door the link opens; the host keeps what each token means. */
  access: Access;
}
/**
 * `general`: anyone with the link, who types a name. `personal`: the host fixed the name; the first browser to open
 * it holds the seat and can always come back. `password`: the host fixed the name; any browser with the password,
 * one connection at a time.
 */
export type AccessKind = 'general' | 'personal' | 'password';
export interface Access {
  kind: AccessKind;
  token: string;
}
const ACCESS_PREFIX: Record<AccessKind, string> = { general: 'g', personal: 'p', password: 'k' };

/** A relay must be TLS, except one on this machine (development and the browser tests). */
export function isRelayUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === 'wss:') return true;
  return url.protocol === 'ws:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

/**
 * A TURN server a browser may relay its WebRTC traffic through when no direct path opens (RFC 7065 URI: `turn:` or
 * `turns:`, host, optional port and transport). The relay sees only DTLS-encrypted bytes.
 */
export function isTurnUrl(value: string): boolean {
  return /^turns?:(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/.test(
    value
  );
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63].map((k) => B64[k]).join('');
    out += chars.slice(0, i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2);
  }
  return out;
}
export function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    const n = [...chunk.padEnd(4, 'A')].reduce((acc, ch) => (acc << 6) | B64.indexOf(ch), 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return Uint8Array.from(bytes);
}

/**
 * The URL fragment (after `#`), which browsers never send to a web server:
 * `join=1.<n | r~relays>.<secret>.<hostKey>.<g|p|k><token>`; relays are space-separated URLs in base64url. A general
 * link has its own token, so dropping a personal token from a link never opens the general door.
 */
export function encodeInvite(invite: Invite): string {
  const signal =
    invite.signal.strategy === 'nostr'
      ? 'n'
      : `r~${base64url(new TextEncoder().encode(invite.signal.urls.join(' ')))}`;
  const access = `${ACCESS_PREFIX[invite.access.kind]}${invite.access.token}`;
  return `join=${[String(COLLAB_PROTOCOL), signal, invite.secret, invite.hostKey, access].join('.')}`;
}

export type InviteRefusal = 'not-invite' | 'version' | 'malformed' | 'relay';
/** Parse a fragment (with or without `#`). Anything that is not exactly an invite this version wrote is refused. */
export function parseInvite(
  fragment: string
): { ok: true; invite: Invite } | { ok: false; reason: InviteRefusal } {
  const body = fragment.replace(/^#/, '');
  if (!body.startsWith('join=')) return { ok: false, reason: 'not-invite' };
  const parts = body.slice('join='.length).split('.');
  if (parts[0] !== String(COLLAB_PROTOCOL)) return { ok: false, reason: 'version' };
  if (parts.length !== 5) return { ok: false, reason: 'malformed' };
  const [, signalPart = '', secret, hostKey, accessPart = ''] = parts;
  const kind = (Object.keys(ACCESS_PREFIX) as AccessKind[]).find((k) => ACCESS_PREFIX[k] === accessPart[0]);
  const token = accessPart.slice(1);
  if (!isToken(secret) || !isToken(hostKey) || !kind || !isToken(token))
    return { ok: false, reason: 'malformed' };
  let signal: Signal;
  if (signalPart === 'n') signal = { strategy: 'nostr' };
  else if (signalPart.startsWith('r~')) {
    const bytes = fromBase64url(signalPart.slice(2));
    if (!bytes) return { ok: false, reason: 'malformed' };
    const urls = new TextDecoder().decode(bytes).split(' ').filter(Boolean);
    if (!urls.length || urls.length > 5 || !urls.every(isRelayUrl)) return { ok: false, reason: 'relay' };
    signal = { strategy: 'relay', urls };
  } else return { ok: false, reason: 'malformed' };
  return { ok: true, invite: { signal, secret, hostKey, access: { kind, token } } };
}

/** The text the host signs to answer a participant's probe: binds this session's key to that participant's nonce. */
export const probeProof = (nonce: string, sessionId: string): string =>
  `witt-collab-v1|${nonce}|${sessionId}`;

// ---- invite passwords ----

/** Wrong passwords before a password invite locks (the host can open it again). */
export const MAX_PASSWORD_FAILURES = 5;
/** Shorter passwords get a warning: an offline guess against a forged link is the risk they must survive. */
export const MIN_PASSWORD_LENGTH = 12;
/**
 * What is compared: Unicode NFC, trimmed, lower case, and any run of spaces, dots, dashes or underscores as one
 * dash, so `Pilvi Kartta` and `pilvi-kartta` are the same password when read out loud or typed on a phone.
 */
export const normalizePassword = (text: string): string =>
  text
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('fi')
    .replace(/[\s._-]+/g, '-');
/**
 * The salt binds a password proof to this host key and this invite: a proof sent to a forged host (another key) is
 * useless at the real one, and one invite's proof is useless for another.
 */
export const passwordSalt = (hostKey: string, token: string): string => `witt-invite-v1|${hostKey}|${token}`;

// ---- digest ----

/** FNV-1a (32 bit) over the document JSON: cheap proof that host and participant hold the same document. */
export function documentDigest(project: Project): string {
  const text = JSON.stringify(project);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---- wire messages ----

export interface Person {
  userId: string;
  name: string;
  online: boolean;
  host: boolean;
}
export type RefuseReason =
  'version' | 'closed' | 'full' | 'invite-used' | 'removed' | 'name' | 'password' | 'locked' | 'revoked';
/** `replaced`: the same person joined from another browser; `revoked`: the host made a new link for this person. */
export type EndReason = 'ended' | 'removed' | 'replaced' | 'revoked';
export type RejectReason = 'rate' | 'forbidden' | 'refused' | 'not-ready';

/** Participant → host (and the probe, to any peer, before the host is known). */
export type ToHost =
  | { t: 'probe'; nonce: string }
  | {
      t: 'hello';
      protocol: number;
      schemaVersion: number;
      /** The link's access token (general or personal). */
      token: string;
      name?: string;
      /** This browser's earlier seat in this session: comes back as the same person. */
      seat?: string;
      /** For a password invite: PBKDF2 of the normalized password with `passwordSalt` (hex). */
      proof?: string;
    }
  | { t: 'ready' }
  | { t: 'propose'; id: string; command: Command }
  | { t: 'resync' }
  | { t: 'bye' };
/** Host → participant. */
export type ToPeer =
  | { t: 'host'; sessionId: string; key: string; signature: string }
  | { t: 'refuse'; reason: RefuseReason }
  | {
      t: 'welcome';
      userId: string;
      name: string;
      seat: string;
      hostName: string;
      seq: number;
      project: Project;
      digest: string;
    }
  | {
      t: 'commit';
      seq: number;
      command: Command;
      now: string;
      actorId: string;
      digest: string;
      proposal?: string;
    }
  | { t: 'reject'; id: string; reason: RejectReason; detail?: string }
  | { t: 'snapshot'; seq: number; project: Project; digest: string }
  | { t: 'roster'; people: Person[] }
  | { t: 'end'; reason: EndReason };

/** Every command type and whether a participant may propose it at all; the compiler insists on the whole union. */
const COMMAND_TYPES = {
  'project.setTitle': true,
  'project.setMode': true,
  'project.setTheme': true,
  'project.setAssessmentWeighting': true,
  'project.setVoteWeighting': true,
  'project.setShowAuthors': true,
  'project.setScoring': true,
  'node.add': true,
  'node.edit': true,
  'node.move': true,
  'node.remove': true,
  'node.collapse': true,
  'node.position': true,
  'node.resize': true,
  'node.template': true,
  'layout.auto': true,
  'layout.fourWay': true,
  'review.credence': true,
  'review.influence': true,
  'review.personal': true,
  'review.abstain': true,
  'link.add': true,
  'link.update': true,
  'link.remove': true,
  'comment.add': true,
  'comment.remove': true,
  'shared.add': true,
  'shared.update': true,
  'shared.attach': true,
  'shared.detach': true,
  'shared.remove': true,
  'concept.add': true,
  'concept.promote': true,
  'concept.update': true,
  'concept.attach': true,
  'concept.reuse': true,
  'concept.detach': true,
  'concept.remove': true,
  'user.add': true,
  'user.rename': true,
  'user.setShares': true,
  'user.remove': true,
  'round.start': true,
  'round.close': true,
  'ballot.cast': true,
  'ballot.retract': true,
} as const satisfies Record<CommandType, true>;
export const ALL_COMMAND_TYPES = Object.keys(COMMAND_TYPES) as CommandType[];

type Parsed<T> = { ok: true; message: T } | { ok: false; reason: string };
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown, max = 200): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isCommand = (v: unknown): v is Command =>
  isObject(v) && typeof v.type === 'string' && Object.hasOwn(COMMAND_TYPES, v.type);
/** A document is checked by `parseProject` where it is adopted; here only its outline. */
const isDocument = (v: unknown): v is Project =>
  isObject(v) && Array.isArray(v.nodes) && Array.isArray(v.users);

function decode(raw: string, max: number): Parsed<Record<string, unknown>> {
  if (raw.length > max) return { ok: false, reason: 'too-large' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  return isObject(value) && typeof value.t === 'string'
    ? { ok: true, message: value }
    : { ok: false, reason: 'no-type' };
}

/** What the host accepts from a participant. */
export function parseToHost(raw: string): Parsed<ToHost> {
  const decoded = decode(raw, MAX_PEER_MESSAGE);
  if (!decoded.ok) return decoded;
  const m = decoded.message;
  const bad = { ok: false as const, reason: `bad-${String(m.t).slice(0, 20)}` };
  switch (m.t) {
    case 'probe':
      return isToken(m.nonce) ? { ok: true, message: { t: 'probe', nonce: m.nonce } } : bad;
    case 'hello':
      if (!Number.isSafeInteger(m.protocol) || !Number.isSafeInteger(m.schemaVersion)) return bad;
      if (!isToken(m.token)) return bad;
      if (m.name !== undefined && !isString(m.name, 120)) return bad;
      if (m.seat !== undefined && !isToken(m.seat)) return bad;
      if (m.proof !== undefined && !(typeof m.proof === 'string' && /^[0-9a-f]{64}$/.test(m.proof)))
        return bad;
      return {
        ok: true,
        message: {
          t: 'hello',
          protocol: m.protocol as number,
          schemaVersion: m.schemaVersion as number,
          token: m.token,
          ...(m.name !== undefined ? { name: m.name as string } : {}),
          ...(m.seat !== undefined ? { seat: m.seat as string } : {}),
          ...(m.proof !== undefined ? { proof: m.proof as string } : {}),
        },
      };
    case 'propose':
      return isString(m.id) && isCommand(m.command)
        ? { ok: true, message: { t: 'propose', id: m.id, command: m.command } }
        : bad;
    case 'ready':
    case 'resync':
    case 'bye':
      return { ok: true, message: { t: m.t } };
    default:
      return { ok: false, reason: 'unknown-type' };
  }
}

const REFUSE_REASONS: readonly RefuseReason[] = [
  'version',
  'closed',
  'full',
  'invite-used',
  'removed',
  'name',
  'password',
  'locked',
  'revoked',
];
const END_REASONS: readonly EndReason[] = ['ended', 'removed', 'replaced', 'revoked'];
const REJECT_REASONS: readonly RejectReason[] = ['rate', 'forbidden', 'refused', 'not-ready'];

/** What a participant accepts from the host it has verified. */
export function parseToPeer(raw: string): Parsed<ToPeer> {
  const decoded = decode(raw, MAX_SNAPSHOT_MESSAGE);
  if (!decoded.ok) return decoded;
  const m = decoded.message;
  const bad = { ok: false as const, reason: `bad-${String(m.t).slice(0, 20)}` };
  switch (m.t) {
    case 'host':
      return isString(m.sessionId, 64) && isString(m.key, 400) && isString(m.signature, 400)
        ? { ok: true, message: { t: 'host', sessionId: m.sessionId, key: m.key, signature: m.signature } }
        : bad;
    case 'refuse':
      return REFUSE_REASONS.includes(m.reason as RefuseReason)
        ? { ok: true, message: { t: 'refuse', reason: m.reason as RefuseReason } }
        : bad;
    case 'welcome':
      return isString(m.userId) &&
        isString(m.name, 120) &&
        isToken(m.seat) &&
        isString(m.hostName, 120) &&
        isCount(m.seq) &&
        isDocument(m.project) &&
        isString(m.digest, 16)
        ? {
            ok: true,
            message: {
              t: 'welcome',
              userId: m.userId,
              name: m.name,
              seat: m.seat,
              hostName: m.hostName,
              seq: m.seq,
              project: m.project,
              digest: m.digest,
            },
          }
        : bad;
    case 'commit':
      return isCount(m.seq) &&
        isCommand(m.command) &&
        isString(m.now, 40) &&
        isString(m.actorId) &&
        isString(m.digest, 16) &&
        (m.proposal === undefined || isString(m.proposal))
        ? {
            ok: true,
            message: {
              t: 'commit',
              seq: m.seq,
              command: m.command,
              now: m.now,
              actorId: m.actorId,
              digest: m.digest,
              ...(m.proposal !== undefined ? { proposal: m.proposal as string } : {}),
            },
          }
        : bad;
    case 'reject':
      return isString(m.id) &&
        REJECT_REASONS.includes(m.reason as RejectReason) &&
        (m.detail === undefined || isString(m.detail, 500))
        ? {
            ok: true,
            message: {
              t: 'reject',
              id: m.id,
              reason: m.reason as RejectReason,
              ...(m.detail !== undefined ? { detail: m.detail as string } : {}),
            },
          }
        : bad;
    case 'snapshot':
      return isCount(m.seq) && isDocument(m.project) && isString(m.digest, 16)
        ? { ok: true, message: { t: 'snapshot', seq: m.seq, project: m.project, digest: m.digest } }
        : bad;
    case 'roster': {
      if (!Array.isArray(m.people) || m.people.length > MAX_SEATS + 1) return bad;
      const people = m.people.filter(
        (p): p is Person =>
          isObject(p) &&
          isString(p.userId) &&
          isString(p.name, 120) &&
          typeof p.online === 'boolean' &&
          typeof p.host === 'boolean'
      );
      return people.length === m.people.length
        ? {
            ok: true,
            message: {
              t: 'roster',
              people: people.map(({ userId, name, online, host }) => ({ userId, name, online, host })),
            },
          }
        : bad;
    }
    case 'end':
      return END_REASONS.includes(m.reason as EndReason)
        ? { ok: true, message: { t: 'end', reason: m.reason as EndReason } }
        : bad;
    default:
      return { ok: false, reason: 'unknown-type' };
  }
}

// ---- authorization ----

/** The participant behind a proposal, as the host knows it (never as the message claims). */
export interface SeatIdentity {
  userId: string;
  name: string;
  /** Named by the host in a personal invite: the participant cannot rename themself. */
  personal: boolean;
}
export type Authorization = { ok: true; command: Command } | { ok: false; reason: 'forbidden' };

/**
 * May this participant propose this command? Deny by default: every command type is listed, governance (people,
 * weights, method, mode, rounds) stays with the host, and every field that names a person must name the seat's own
 * profile. `comment.add` gets the seat's name whatever the message said. `applyCommand` still decides validity.
 */
export function authorizeCommand(project: Project, command: Command, seat: SeatIdentity): Authorization {
  const allow: Authorization = { ok: true, command };
  const deny: Authorization = { ok: false, reason: 'forbidden' };
  const own = (userId: string) => (userId === seat.userId ? allow : deny);
  switch (command.type) {
    case 'project.setTitle':
    case 'project.setTheme':
    case 'node.add':
    case 'node.move':
    case 'node.remove':
    case 'node.collapse':
    case 'node.position':
    case 'node.resize':
    case 'node.template':
    case 'layout.auto':
    case 'layout.fourWay':
    case 'link.add':
    case 'link.update':
    case 'link.remove':
    case 'shared.add':
    case 'shared.update':
    case 'shared.attach':
    case 'shared.detach':
    case 'shared.remove':
    case 'concept.add':
    case 'concept.promote':
    case 'concept.update':
    case 'concept.attach':
    case 'concept.reuse':
    case 'concept.detach':
    case 'concept.remove':
      return allow;
    case 'node.edit': {
      if (command.authorVisibility === undefined) return allow;
      // Whether a card shows its author's name is the author's call.
      const node = project.nodes.find((n) => n.id === command.id);
      return node && node.createdBy === seat.userId ? allow : deny;
    }
    case 'review.credence':
    case 'review.personal':
    case 'review.abstain':
    case 'review.influence':
    case 'ballot.cast':
    case 'ballot.retract':
      return own(command.userId);
    case 'comment.add':
      return command.authorId === seat.userId
        ? { ok: true, command: { ...command, authorName: seat.name } }
        : deny;
    case 'comment.remove': {
      const comment = (project.comments ?? []).find((c) => c.id === command.id);
      return comment && comment.authorId === seat.userId ? allow : deny;
    }
    case 'user.rename':
      return !seat.personal && command.id === seat.userId ? allow : deny;
    case 'project.setMode':
    case 'project.setAssessmentWeighting':
    case 'project.setVoteWeighting':
    case 'project.setShowAuthors':
    case 'project.setScoring':
    case 'user.add':
    case 'user.setShares':
    case 'user.remove':
    case 'round.start':
    case 'round.close':
      return deny;
    default:
      return assertUnreachable(command);
  }
}
function assertUnreachable(value: never): never {
  throw new Error(`Tuntematon komento ${JSON.stringify(value)}`);
}

// ---- the host's seats ----

export interface Seat extends SeatIdentity {
  /** The participant's proof for rejoining; handed over in `welcome`, kept by that browser. */
  seat: string;
  /** The network peer currently holding the seat; null while away. */
  peerId: string | null;
  removed: boolean;
  /** Removed because the host made a new link for this person (the old browser is told why). */
  revoked?: true;
  /** The seat's profile has been added to the document (after `ready`). */
  joined: boolean;
  /** The personal invite that created the seat, if any. */
  invite: string | null;
  bucket: { tokens: number; atMs: number };
}
export interface PendingInvite {
  token: string;
  mode: 'personal' | 'password';
  /** An existing profile in the document, or a new one created on first join. */
  userId: string;
  name: string;
  /** `personal`: a browser has taken the seat. */
  claimed: boolean;
  /** `password`: the expected proof (hex) and the wrong tries since the last success or unlock. */
  verifier: string | null;
  failures: number;
  /** Replaced by a newer link for the same person. */
  revoked: boolean;
}
export interface HostState {
  sessionId: string;
  seq: number;
  /** The general link's token; a personal token never opens it. */
  generalToken: string;
  /** Anyone with the general link may join (false: only personal invites and returning seats). */
  generalOpen: boolean;
  seats: Seat[];
  invites: PendingInvite[];
}
export const createHostState = (sessionId: string, generalToken: string): HostState => ({
  sessionId,
  seq: 0,
  generalToken,
  generalOpen: true,
  seats: [],
  invites: [],
});

/** A name nobody in the document has yet (`user.add` refuses duplicates): "Maija", "Maija (2)", … */
export function uniqueName(project: Project, wanted: string, reserved: readonly string[] = []): string {
  const base = wanted.trim().slice(0, 110);
  const taken = new Set([...project.users.map((u) => u.name), ...reserved].map((n) => n.toLocaleLowerCase()));
  if (!taken.has(base.toLocaleLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

export type Admission =
  | {
      ok: true;
      state: HostState;
      seat: Seat;
      rejoined: boolean;
      /** The peer that held this seat until now (another browser of the same person): it is told and dropped. */
      replaced: string | null;
    }
  | { ok: false; reason: RefuseReason; state: HostState };
/**
 * A hello from `peerId`. A known seat token comes back as its person. Otherwise the link's token decides: the
 * general token admits a new person under a unique name; a personal token is claimed by the first browser; a
 * password token admits any browser whose proof matches (counting wrong tries up to a lock) and takes the person's
 * seat over from another browser. Ids and tokens come in.
 */
export function admit(
  state: HostState,
  project: Project,
  hello: Extract<ToHost, { t: 'hello' }>,
  peerId: string,
  fresh: { userId: string; seat: string; nowMs: number }
): Admission {
  const refuse = (reason: RefuseReason, next = state): Admission => ({ ok: false, reason, state: next });
  if (hello.protocol !== COLLAB_PROTOCOL || hello.schemaVersion !== SCHEMA_VERSION) return refuse('version');
  const take = (seat: Seat, rejoined: boolean, base = state): Admission => {
    const replaced = seat.peerId && seat.peerId !== peerId ? seat.peerId : null;
    const next = { ...seat, peerId };
    const exists = base.seats.some((s) => s.seat === seat.seat);
    return {
      ok: true,
      state: exists ? replaceSeat(base, next) : { ...base, seats: [...base.seats, next] },
      seat: next,
      rejoined,
      replaced,
    };
  };
  if (hello.seat) {
    const seat = state.seats.find((s) => s.seat === hello.seat);
    if (seat?.removed) return refuse(seat.revoked ? 'revoked' : 'removed');
    if (seat) return take(seat, true);
  }
  const bucket = { tokens: RATE_BURST, atMs: fresh.nowMs };
  const active = state.seats.filter((s) => !s.removed).length;
  if (hello.token === state.generalToken) {
    if (!state.generalOpen) return refuse('closed');
    if (active >= MAX_SEATS) return refuse('full');
    const wanted = hello.name?.trim();
    if (!wanted) return refuse('name');
    const reserved = [...state.seats.map((s) => s.name), ...state.invites.map((i) => i.name)];
    const seat: Seat = {
      userId: fresh.userId,
      name: uniqueName(project, wanted, reserved),
      personal: false,
      seat: fresh.seat,
      peerId,
      removed: false,
      joined: false,
      invite: null,
      bucket,
    };
    return take(seat, false);
  }
  const invite = state.invites.find((i) => i.token === hello.token);
  if (!invite) return refuse('closed');
  if (invite.revoked) return refuse('revoked');
  const held = state.seats.find((s) => s.invite === invite.token && !s.removed);
  const fromInvite = (): Seat => ({
    userId: invite.userId,
    name: invite.name,
    personal: true,
    seat: fresh.seat,
    peerId,
    removed: false,
    joined: project.users.some((u) => u.id === invite.userId),
    invite: invite.token,
    bucket,
  });
  const withInvite = (patch: Partial<PendingInvite>): HostState => ({
    ...state,
    invites: state.invites.map((i) => (i.token === invite.token ? { ...i, ...patch } : i)),
  });
  if (invite.mode === 'personal') {
    if (invite.claimed || held) return refuse('invite-used');
    if (active >= MAX_SEATS) return refuse('full');
    return take(fromInvite(), false, withInvite({ claimed: true }));
  }
  if (invite.failures >= MAX_PASSWORD_FAILURES) return refuse('locked');
  if (!hello.proof || hello.proof !== invite.verifier) {
    const failures = invite.failures + (hello.proof ? 1 : 0);
    return refuse(failures >= MAX_PASSWORD_FAILURES ? 'locked' : 'password', withInvite({ failures }));
  }
  const next = withInvite({ failures: 0, claimed: true });
  if (held) return take(held, true, next);
  if (active >= MAX_SEATS) return refuse('full');
  return take(fromInvite(), false, next);
}

/**
 * A new link for a person (a new name, or an existing profile): earlier links and seats of the same profile stop
 * working, so a lost or leaked link is replaced without losing the person's assessments. Returns the seats that must
 * be told (`revoked`).
 */
export function issueInvite(
  state: HostState,
  invite: Omit<PendingInvite, 'claimed' | 'failures' | 'revoked'>
): { state: HostState; dropped: Seat[] } {
  const dropped = state.seats.filter((s) => s.userId === invite.userId && !s.removed);
  return {
    state: {
      ...state,
      invites: [
        ...state.invites.map((i) => (i.userId === invite.userId ? { ...i, revoked: true } : i)),
        { ...invite, claimed: false, failures: 0, revoked: false },
      ],
      seats: state.seats.map((s) =>
        s.userId === invite.userId && !s.removed
          ? { ...s, removed: true, revoked: true as const, peerId: null }
          : s
      ),
    },
    dropped,
  };
}
/**
 * The host gives a password invite a new password: same token, so the link stays the same; the failure count starts
 * over; seats already admitted keep their place (they return by seat, not by password).
 */
export const setInvitePassword = (state: HostState, token: string, verifier: string): HostState => ({
  ...state,
  invites: state.invites.map((i) =>
    i.token === token && i.mode === 'password' && !i.revoked ? { ...i, verifier, failures: 0 } : i
  ),
});
/** The host opens a locked password invite again. */
export const unlockInvite = (state: HostState, token: string): HostState => ({
  ...state,
  invites: state.invites.map((i) => (i.token === token ? { ...i, failures: 0 } : i)),
});

export function replaceSeat(state: HostState, seat: Seat): HostState {
  return { ...state, seats: state.seats.map((s) => (s.seat === seat.seat ? seat : s)) };
}
export const seatOfPeer = (state: HostState, peerId: string): Seat | undefined =>
  state.seats.find((s) => s.peerId === peerId && !s.removed);

/** Spend one proposal from the seat's bucket; refill at RATE_PER_SECOND up to RATE_BURST. */
export function spendRate(seat: Seat, nowMs: number): { ok: boolean; seat: Seat } {
  const elapsed = Math.max(0, nowMs - seat.bucket.atMs) / 1000;
  const tokens = Math.min(RATE_BURST, seat.bucket.tokens + elapsed * RATE_PER_SECOND);
  if (tokens < 1) return { ok: false, seat: { ...seat, bucket: { tokens, atMs: nowMs } } };
  return { ok: true, seat: { ...seat, bucket: { tokens: tokens - 1, atMs: nowMs } } };
}

/** The `user.add` that brings a newly joined seat's profile into the document, or null when it is there already. */
export function seatProfileCommand(project: Project, seat: Seat): Command | null {
  if (project.users.some((u) => u.id === seat.userId)) return null;
  return {
    type: 'user.add',
    id: seat.userId,
    name: uniqueName(project, seat.name),
    shares: 1,
    role: 'editor',
  };
}

/** Who is in the session, for everyone's participant list: the host first, then seats in joining order. */
export function roster(state: HostState, project: Project, hostUserId: string): Person[] {
  const nameOf = (id: string, fallback: string) => project.users.find((u) => u.id === id)?.name ?? fallback;
  return [
    { userId: hostUserId, name: nameOf(hostUserId, '?'), online: true, host: true },
    ...state.seats
      .filter((s) => !s.removed && s.joined)
      .map((s) => ({
        userId: s.userId,
        name: nameOf(s.userId, s.name),
        online: s.peerId !== null,
        host: false,
      })),
  ];
}

// ---- the participant's side ----

/** Where an incoming commit stands against the participant's last applied sequence number. */
export function commitOrder(lastSeq: number, commitSeq: number): 'apply' | 'stale' | 'gap' {
  if (commitSeq === lastSeq + 1) return 'apply';
  return commitSeq <= lastSeq ? 'stale' : 'gap';
}
