// The collaboration controller (WG-030): carries the protocol of src/domain/session.ts over a PeerNetwork and keeps a
// document in step through a DocumentPort. No React and no store import, so Node tests drive a host and several
// participants over the LoopbackHub. The host orders every change; a participant proposes and applies only commits.
import {
  COLLAB_PROTOCOL,
  MAX_PASSWORD_FAILURES,
  SCHEMA_VERSION,
  admit,
  authorizeCommand,
  commitOrder,
  createHostState,
  documentDigest,
  encodeInvite,
  issueInvite,
  parseProject,
  parseToHost,
  parseToPeer,
  passwordSalt,
  probeProof,
  replaceSeat,
  roster,
  seatOfPeer,
  seatProfileCommand,
  setInvitePassword,
  spendRate,
  unlockInvite,
} from '../../domain/index.ts';
import type {
  AccessKind,
  Command,
  CommandContext,
  EndReason,
  HostState,
  Invite,
  Person,
  Project,
  RefuseReason,
  RejectReason,
  Signal,
  ToHost,
  ToPeer,
} from '../../domain/index.ts';
import { createHostKey, hostKeyFrom, passwordProof, randomToken, roomAddress, verifyHost } from './keys.ts';
import type { HostKey, StoredHostKey } from './keys.ts';
import type { ConnectNetwork, PeerNetwork } from './network.ts';

/** How the controller reads and changes the open document; the app's store implements it. */
export interface DocumentPort {
  current(): Project;
  /** Apply with exactly this context, outside the undo history; throws the domain's refusal. */
  apply(command: Command, ctx: CommandContext): Project;
  /** Replace the document with the host's (already validated). */
  adopt(project: Project): void;
}
export interface CollabClock {
  nowIso(): string;
  nowMs(): number;
  newId(): string;
  /** Run `run` once after `ms`; returns a cancel function. */
  schedule(run: () => void, ms: number): () => void;
}

/** `no-direct`: the host was found through signaling, but no direct connection opened (where TURN helps). */
export type EndCause =
  EndReason | 'host-left' | 'unreachable' | 'no-direct' | 'left' | 'diverged' | `refused-${RefuseReason}`;
export interface CollabStatus {
  role: 'host' | 'participant';
  /** `reconnecting`: a participant lost the host and waits for it to come back (a reload on the host's side). */
  phase: 'connecting' | 'confirm' | 'active' | 'reconnecting' | 'ended';
  ended: EndCause | null;
  people: Person[];
  /** Proposals sent and not yet committed or rejected. */
  pending: number;
  /** The profile this browser acts as in the session. */
  selfUserId: string | null;
  /** Participant: the name the host gave this seat and the inviter's name, once welcomed. */
  selfName: string | null;
  hostName: string | null;
  /** Participant: the shared document named in the welcome, before and after joining. */
  document: { id: string; title: string; nodes: number } | null;
  /** Host: the general link fragment, personal invites (newest first), whether the general link admits. */
  link: string | null;
  invites: InviteView[];
  generalOpen: boolean;
}
export interface InviteView {
  token: string;
  name: string;
  userId: string;
  mode: 'personal' | 'password';
  /** `personal`: a browser holds the seat; `password`: someone has joined with the password. */
  claimed: boolean;
  failures: number;
  locked: boolean;
  link: string;
}
export type CollabNotice =
  | { kind: 'rejected'; reason: RejectReason; detail?: string }
  | { kind: 'joined'; name: string }
  | { kind: 'left'; name: string };

interface Common {
  status(): CollabStatus;
  subscribe(listener: (status: CollabStatus) => void): () => void;
  onNotice(listener: (notice: CollabNotice) => void): () => void;
  /** Leave (participant) or end for everyone (host). */
  close(): Promise<void>;
}

const blankStatus = (role: CollabStatus['role']): CollabStatus => ({
  role,
  phase: 'connecting',
  ended: null,
  people: [],
  pending: 0,
  selfUserId: null,
  selfName: null,
  hostName: null,
  document: null,
  link: null,
  invites: [],
  generalOpen: true,
});

class Emitter {
  status: CollabStatus;
  private readonly listeners = new Set<(s: CollabStatus) => void>();
  private readonly noticeListeners = new Set<(n: CollabNotice) => void>();
  constructor(role: CollabStatus['role']) {
    this.status = blankStatus(role);
  }
  set(patch: Partial<CollabStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l(this.status));
  }
  subscribe(listener: (s: CollabStatus) => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  notice(n: CollabNotice) {
    this.noticeListeners.forEach((l) => l(n));
  }
  onNotice(listener: (n: CollabNotice) => void) {
    this.noticeListeners.add(listener);
    return () => void this.noticeListeners.delete(listener);
  }
}

// ---- host ----

/** What the host's browser keeps so a reload continues the same session with the same links. */
export interface HostRecord {
  version: 1;
  documentId: string;
  hostUserId: string;
  signal: Signal;
  secret: string;
  key: StoredHostKey;
  state: HostState;
}

export interface HostSession extends Common {
  /** Called by the store after it applied a local command. */
  localApplied(command: Command, ctx: CommandContext, next: Project): void;
  /** Called by the store after the host replaced the whole document with a version of the same one. */
  replaced(next: Project): void;
  /**
   * A personal link for a new name or an existing profile; the opener cannot change the name. Earlier links and
   * seats of the same profile stop working. `password` mode admits any browser with the password.
   */
  invite(
    person: { name: string } | { userId: string },
    access: { mode: 'personal' } | { mode: 'password'; password: string }
  ): Promise<string>;
  unlock(token: string): void;
  /** A new password for a password invite; the link stays the same and admitted seats stay. */
  setPassword(token: string, password: string): Promise<void>;
  remove(userId: string): void;
  setGeneralOpen(open: boolean): void;
}

export async function startHost(options: {
  port: DocumentPort;
  connect: ConnectNetwork;
  signal: Signal;
  hostUserId: string;
  clock: CollabClock;
  /** Continue a session this browser hosted before a reload. */
  resume?: HostRecord;
  /** Keep the record (on every change of seats or invites), or forget it (`null`) when the session ends. */
  onRecord?: (record: HostRecord | null) => void;
  /** PBKDF2 rounds for password invites (tests pass fewer). */
  passwordRounds?: number;
}): Promise<HostSession> {
  const { port, clock, resume } = options;
  const hostUserId = resume?.hostUserId ?? options.hostUserId;
  const signal = resume?.signal ?? options.signal;
  const secret = resume?.secret ?? randomToken();
  const key: HostKey = resume ? hostKeyFrom(resume.key) : await createHostKey();
  const network: PeerNetwork = await options.connect(await roomAddress(signal, secret));
  const link = (kind: AccessKind, token: string) =>
    encodeInvite({ signal, secret, hostKey: key.fingerprint, access: { kind, token } });
  const emitter = new Emitter('host');
  let state: HostState = resume
    ? { ...resume.state, seats: resume.state.seats.map((s) => ({ ...s, peerId: null })) }
    : createHostState(randomToken(), randomToken());
  let closed = false;

  const keep = () =>
    options.onRecord?.({
      version: 1,
      documentId: port.current().id,
      hostUserId,
      signal,
      secret,
      key: { privateKey: key.privateKey, publicKey: key.publicKey, fingerprint: key.fingerprint },
      state,
    });
  const send = (peerId: string, message: ToPeer) => network.sendTo(peerId, JSON.stringify(message));
  const online = () => state.seats.filter((s) => s.peerId && !s.removed);
  const publish = () => {
    const people = roster(state, port.current(), hostUserId);
    emitter.set({
      phase: closed ? 'ended' : 'active',
      people,
      selfUserId: hostUserId,
      link: link('general', state.generalToken),
      generalOpen: state.generalOpen,
      invites: state.invites
        .filter((i) => !i.revoked)
        .map((i) => ({
          token: i.token,
          name: i.name,
          userId: i.userId,
          mode: i.mode,
          claimed: i.claimed,
          failures: i.failures,
          locked: i.failures >= MAX_PASSWORD_FAILURES,
          link: link(i.mode, i.token),
        }))
        .reverse(),
    });
    for (const seat of online()) if (seat.joined) send(seat.peerId as string, { t: 'roster', people });
  };
  const broadcastCommit = (
    command: Command,
    ctx: CommandContext,
    next: Project,
    proposal?: { id: string; peerId: string }
  ) => {
    state = { ...state, seq: state.seq + 1 };
    const message: ToPeer = {
      t: 'commit',
      seq: state.seq,
      command,
      now: ctx.now,
      actorId: ctx.actorId,
      digest: documentDigest(next),
    };
    for (const seat of online())
      send(
        seat.peerId as string,
        proposal && seat.peerId === proposal.peerId ? { ...message, proposal: proposal.id } : message
      );
  };
  /** The host's own change on behalf of the session (a newcomer's profile). */
  const commitAsHost = (command: Command) => {
    const ctx = { now: clock.nowIso(), actorId: hostUserId };
    const next = port.apply(command, ctx);
    broadcastCommit(command, ctx, next);
  };

  const onMessage = async (peerId: string, raw: string) => {
    if (closed) return;
    const parsed = parseToHost(raw);
    if (!parsed.ok) return;
    const message: ToHost = parsed.message;
    switch (message.t) {
      case 'probe': {
        const signature = await key.sign(probeProof(message.nonce, state.sessionId));
        send(peerId, { t: 'host', sessionId: state.sessionId, key: key.publicKey, signature });
        return;
      }
      case 'hello': {
        const project = port.current();
        const result = admit(state, project, message, peerId, {
          userId: clock.newId(),
          seat: randomToken(),
          nowMs: clock.nowMs(),
        });
        state = result.state;
        keep();
        if (!result.ok) {
          send(peerId, { t: 'refuse', reason: result.reason });
          publish();
          return;
        }
        if (result.replaced) send(result.replaced, { t: 'end', reason: 'replaced' });
        const hostName = project.users.find((u) => u.id === hostUserId)?.name ?? '?';
        const name = project.users.find((u) => u.id === result.seat.userId)?.name ?? result.seat.name;
        send(peerId, {
          t: 'welcome',
          userId: result.seat.userId,
          name,
          seat: result.seat.seat,
          hostName,
          seq: state.seq,
          project,
          digest: documentDigest(project),
        });
        publish();
        return;
      }
      case 'ready': {
        const seat = seatOfPeer(state, peerId);
        if (!seat || seat.joined) return;
        const command = seatProfileCommand(port.current(), seat);
        state = replaceSeat(state, { ...seat, joined: true });
        keep();
        if (command) commitAsHost(command);
        emitter.notice({ kind: 'joined', name: seat.name });
        publish();
        return;
      }
      case 'propose': {
        const seat = seatOfPeer(state, peerId);
        if (!seat || !seat.joined) {
          send(peerId, { t: 'reject', id: message.id, reason: 'not-ready' });
          return;
        }
        const rate = spendRate(seat, clock.nowMs());
        state = replaceSeat(state, rate.seat);
        if (!rate.ok) {
          send(peerId, { t: 'reject', id: message.id, reason: 'rate' });
          return;
        }
        const project = port.current();
        const name = project.users.find((u) => u.id === seat.userId)?.name ?? seat.name;
        const verdict = authorizeCommand(project, message.command, { ...seat, name });
        if (!verdict.ok) {
          send(peerId, { t: 'reject', id: message.id, reason: 'forbidden' });
          return;
        }
        const ctx = { now: clock.nowIso(), actorId: seat.userId };
        let next: Project;
        try {
          next = port.apply(verdict.command, ctx);
        } catch (error) {
          const detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
          send(peerId, { t: 'reject', id: message.id, reason: 'refused', detail });
          return;
        }
        broadcastCommit(verdict.command, ctx, next, { id: message.id, peerId });
        return;
      }
      case 'resync': {
        if (!seatOfPeer(state, peerId)) return;
        const project = port.current();
        send(peerId, { t: 'snapshot', seq: state.seq, project, digest: documentDigest(project) });
        return;
      }
      case 'bye': {
        departed(peerId);
        return;
      }
    }
  };
  const departed = (peerId: string) => {
    const seat = seatOfPeer(state, peerId);
    if (!seat) return;
    state = replaceSeat(state, { ...seat, peerId: null });
    if (seat.joined) emitter.notice({ kind: 'left', name: seat.name });
    publish();
  };
  network.onMessage((peerId, raw) => void onMessage(peerId, raw));
  network.onPeer((event) => {
    if (event.kind === 'left') departed(event.peerId);
  });
  keep();
  publish();

  return {
    status: () => emitter.status,
    subscribe: (l) => emitter.subscribe(l),
    onNotice: (l) => emitter.onNotice(l),
    localApplied(command, ctx, next) {
      if (!closed) broadcastCommit(command, ctx, next);
    },
    replaced(next) {
      if (closed) return;
      state = { ...state, seq: state.seq + 1 };
      for (const seat of online())
        send(seat.peerId as string, {
          t: 'snapshot',
          seq: state.seq,
          project: next,
          digest: documentDigest(next),
        });
    },
    async invite(person, access) {
      const token = randomToken();
      const project = port.current();
      const existing = 'userId' in person ? project.users.find((u) => u.id === person.userId) : undefined;
      const name = existing?.name ?? ('name' in person ? person.name.trim() : '');
      if (!name) throw new Error('name required');
      const verifier =
        access.mode === 'password'
          ? await passwordProof(access.password, passwordSalt(key.fingerprint, token), options.passwordRounds)
          : null;
      const issued = issueInvite(state, {
        token,
        mode: access.mode,
        userId: existing?.id ?? clock.newId(),
        name,
        verifier,
      });
      for (const seat of issued.dropped) if (seat.peerId) send(seat.peerId, { t: 'end', reason: 'revoked' });
      state = issued.state;
      keep();
      publish();
      return link(access.mode, token);
    },
    unlock(token) {
      state = unlockInvite(state, token);
      keep();
      publish();
    },
    async setPassword(token, password) {
      const verifier = await passwordProof(
        password,
        passwordSalt(key.fingerprint, token),
        options.passwordRounds
      );
      state = setInvitePassword(state, token, verifier);
      keep();
      publish();
    },
    remove(userId) {
      const seat = state.seats.find((s) => s.userId === userId && !s.removed);
      if (!seat) return;
      if (seat.peerId) send(seat.peerId, { t: 'end', reason: 'removed' });
      state = replaceSeat(state, { ...seat, removed: true, peerId: null });
      keep();
      publish();
    },
    setGeneralOpen(open) {
      state = { ...state, generalOpen: open };
      keep();
      publish();
    },
    async close() {
      if (closed) return;
      for (const seat of online()) send(seat.peerId as string, { t: 'end', reason: 'ended' });
      closed = true;
      options.onRecord?.(null);
      emitter.set({ phase: 'ended', ended: 'ended' });
      await network.leave();
    },
  };
}

// ---- participant ----

export interface ParticipantSession extends Common {
  /** After the welcome: the person agreed to replace their open work with the shared document. */
  accept(): void;
  /** Send a change to the host; it lands when the host commits it. */
  propose(command: Command): void;
}

export async function joinSession(options: {
  port: DocumentPort;
  connect: ConnectNetwork;
  invite: Invite;
  /** Asked before connecting when the link is general; ignored by the host for a personal invite. */
  name?: string;
  /** For a password invite. */
  password?: string;
  /** A seat this browser held in this session before: comes back as the same person, no name or password asked. */
  seat?: string;
  /** Remember the seat so this browser can come back. */
  onSeat?: (seat: string) => void;
  clock: CollabClock;
  timeoutMs?: number;
  /** How long to wait for a host that disappeared (a reload) before giving up. */
  reconnectMs?: number;
  passwordRounds?: number;
}): Promise<ParticipantSession> {
  const { port, clock, invite } = options;
  const emitter = new Emitter('participant');
  const network = await options.connect(await roomAddress(invite.signal, invite.secret));
  const nonces = new Map<string, string>();
  let hostPeer: string | null = null;
  let seat = options.seat;
  let lastSeq = 0;
  let welcome: Extract<ToPeer, { t: 'welcome' }> | null = null;
  /** Commits that arrive while the person is still deciding whether to join. */
  let buffered: Extract<ToPeer, { t: 'commit' }>[] = [];
  let awaitingSnapshot = false;
  const pending = new Set<string>();
  let finished = false;
  /** Someone answered through signaling but no direct connection opened; tells a firewall from an absent host. */
  let noDirect = false;
  const proof = options.password
    ? passwordProof(
        options.password,
        passwordSalt(invite.hostKey, invite.access.token),
        options.passwordRounds
      )
    : null;

  const sendHost = (message: ToHost) => {
    if (hostPeer) network.sendTo(hostPeer, JSON.stringify(message));
  };
  let cancelTimer: () => void = () => undefined;
  const finish = async (cause: EndCause) => {
    if (finished) return;
    finished = true;
    cancelTimer();
    pending.clear();
    emitter.set({ phase: 'ended', ended: cause, pending: 0 });
    await network.leave();
  };
  cancelTimer = clock.schedule(() => {
    if (!welcome) void finish(noDirect ? 'no-direct' : 'unreachable');
  }, options.timeoutMs ?? 45_000);

  /** Take the host's document; after the first one it must stay the same document (same id). */
  const adopt = (raw: Project, digest: string, seq: number, first = false): boolean => {
    let project: Project;
    try {
      project = parseProject(raw);
    } catch {
      return false;
    }
    if (!first && port.current().id !== project.id) return false;
    port.adopt(project);
    lastSeq = seq;
    awaitingSnapshot = documentDigest(port.current()) !== digest;
    if (awaitingSnapshot) sendHost({ t: 'resync' });
    return true;
  };
  const applyCommit = (commit: Extract<ToPeer, { t: 'commit' }>) => {
    if (commit.proposal && pending.delete(commit.proposal)) emitter.set({ pending: pending.size });
    if (awaitingSnapshot) return;
    const order = commitOrder(lastSeq, commit.seq);
    if (order === 'stale') return;
    if (order === 'gap') {
      awaitingSnapshot = true;
      sendHost({ t: 'resync' });
      return;
    }
    try {
      port.apply(commit.command, { now: commit.now, actorId: commit.actorId });
    } catch {
      // The host applied it, so our copy must have drifted; fetch the host's.
      awaitingSnapshot = true;
      sendHost({ t: 'resync' });
      return;
    }
    lastSeq = commit.seq;
    if (documentDigest(port.current()) !== commit.digest) {
      awaitingSnapshot = true;
      sendHost({ t: 'resync' });
    }
  };
  /** The host is gone (closed or reloading): wait for it to come back under the same key, then rejoin. */
  const lostHost = () => {
    hostPeer = null;
    nonces.clear();
    if (emitter.status.phase !== 'active') {
      void finish('host-left');
      return;
    }
    pending.clear();
    emitter.set({ phase: 'reconnecting', pending: 0 });
    cancelTimer = clock.schedule(() => {
      if (emitter.status.phase === 'reconnecting') void finish('host-left');
    }, options.reconnectMs ?? 120_000);
  };

  const onMessage = async (peerId: string, raw: string) => {
    if (finished) return;
    if (hostPeer === null) {
      // Before the host has proved itself, only its signed answer to our probe counts.
      const parsed = parseToPeer(raw);
      const nonce = nonces.get(peerId);
      if (!parsed.ok || parsed.message.t !== 'host' || !nonce) return;
      const { sessionId, key, signature } = parsed.message;
      if (!(await verifyHost(invite.hostKey, key, signature, probeProof(nonce, sessionId)))) return;
      if (hostPeer !== null) return;
      hostPeer = peerId;
      const answer = seat ? null : await proof;
      sendHost({
        t: 'hello',
        protocol: COLLAB_PROTOCOL,
        schemaVersion: SCHEMA_VERSION,
        token: invite.access.token,
        ...(seat ? { seat } : {}),
        ...(options.name ? { name: options.name } : {}),
        ...(answer ? { proof: answer } : {}),
      });
      return;
    }
    if (peerId !== hostPeer) return;
    const parsed = parseToPeer(raw);
    if (!parsed.ok) return;
    const message = parsed.message;
    switch (message.t) {
      case 'host':
        return;
      case 'refuse':
        await finish(`refused-${message.reason}`);
        return;
      case 'welcome':
        if (emitter.status.phase === 'reconnecting') {
          cancelTimer();
          emitter.set({ phase: 'active' });
          if (!adopt(message.project, message.digest, message.seq)) await finish('diverged');
          return;
        }
        if (welcome) return;
        welcome = message;
        seat = message.seat;
        cancelTimer();
        options.onSeat?.(message.seat);
        emitter.set({
          phase: 'confirm',
          selfUserId: message.userId,
          selfName: message.name,
          hostName: message.hostName,
          document: {
            id: String(message.project.id),
            title: String(message.project.title),
            nodes: message.project.nodes.length,
          },
        });
        return;
      case 'commit':
        if (emitter.status.phase === 'confirm') buffered.push(message);
        else if (emitter.status.phase === 'active') applyCommit(message);
        return;
      case 'reject':
        if (pending.delete(message.id)) emitter.set({ pending: pending.size });
        emitter.notice({
          kind: 'rejected',
          reason: message.reason,
          ...(message.detail ? { detail: message.detail } : {}),
        });
        return;
      case 'snapshot':
        if (emitter.status.phase !== 'active') return;
        if (!adopt(message.project, message.digest, message.seq)) await finish('diverged');
        return;
      case 'roster':
        emitter.set({ people: message.people });
        return;
      case 'end':
        await finish(message.reason);
        return;
    }
  };
  network.onMessage((peerId, raw) => void onMessage(peerId, raw));
  network.onPeer((event) => {
    if (event.kind === 'joined' && hostPeer === null) {
      const nonce = randomToken();
      nonces.set(event.peerId, nonce);
      network.sendTo(event.peerId, JSON.stringify({ t: 'probe', nonce } satisfies ToHost));
    }
    if (event.kind === 'left' && event.peerId === hostPeer && !finished) lostHost();
    if (event.kind === 'unreachable' && hostPeer === null) noDirect = true;
  });

  return {
    status: () => emitter.status,
    subscribe: (l) => emitter.subscribe(l),
    onNotice: (l) => emitter.onNotice(l),
    accept() {
      if (!welcome || emitter.status.phase !== 'confirm') return;
      emitter.set({ phase: 'active' });
      if (!adopt(welcome.project, welcome.digest, welcome.seq, true)) {
        void finish('diverged');
        return;
      }
      const early = buffered;
      buffered = [];
      early.forEach(applyCommit);
      sendHost({ t: 'ready' });
    },
    propose(command) {
      if (emitter.status.phase !== 'active') return;
      const id = clock.newId();
      pending.add(id);
      emitter.set({ pending: pending.size });
      sendHost({ t: 'propose', id, command });
    },
    async close() {
      sendHost({ t: 'bye' });
      await finish('left');
    },
  };
}
