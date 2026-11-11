// Live collaboration in the app (WG-030): starting a session as host (and continuing it after a reload), joining
// from an invite link, coming back to a session this browser was in, and the remembered connection choice. The
// protocol lives in src/lib/p2p; the store only routes commands.
import { useSyncExternalStore } from 'react';
import { encodeInvite, isRelayUrl, parseInvite } from '../domain/index.ts';
import type { Invite, InviteRefusal, Signal } from '../domain/index.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';
import { newId, nowIso } from '../lib/providers.ts';
import { loadHostRecord, saveHostRecord } from '../lib/p2p/hostStore.ts';
import { roomAddress } from '../lib/p2p/keys.ts';
import { joinSession, startHost } from '../lib/p2p/session.ts';
import type { CollabClock, EndCause, HostRecord } from '../lib/p2p/session.ts';
import { connectTrystero } from '../lib/p2p/trystero.ts';
import { blankProject, getStore } from './store.ts';

/** Per browser: the connection the host chose last (`nostr`, or relay URLs separated by spaces). */
export const SIGNAL_KEY = 'witt-collab-signal-v1';
/** Per browser: this browser's seat in each session it joined, by room, so the same link brings the person back. */
export const SEATS_KEY = 'witt-collab-seats-v1';
/** Per tab: the link of the session this tab is in, so a reload rejoins without the address-bar fragment. */
export const TAB_KEY = 'witt-collab-v1';
const SEAT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const clock: CollabClock = {
  nowIso,
  nowMs: () => Date.now(),
  newId,
  schedule(run, ms) {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}
export function readSignal(): Signal {
  const raw = safe(() => window.localStorage.getItem(SIGNAL_KEY), null);
  if (!raw || raw === 'nostr') return { strategy: 'nostr' };
  const urls = raw.split(' ').filter(isRelayUrl);
  return urls.length ? { strategy: 'relay', urls } : { strategy: 'nostr' };
}
export function writeSignal(signal: Signal) {
  safe(
    () =>
      window.localStorage.setItem(SIGNAL_KEY, signal.strategy === 'nostr' ? 'nostr' : signal.urls.join(' ')),
    undefined
  );
}
/** The page address with an invite fragment: what the person copies and sends. */
export const inviteUrl = (fragment: string): string =>
  `${window.location.origin}${window.location.pathname}${window.location.search}#${fragment}`;

// ---- seats this browser holds ----

type Seats = Record<string, { seat: string; at: number }>;
const readSeats = (): Seats => {
  const parsed = safe(() => JSON.parse(window.localStorage.getItem(SEATS_KEY) ?? '{}') as unknown, {});
  if (!parsed || typeof parsed !== 'object') return {};
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(parsed as Seats).filter(
      ([, v]) => typeof v?.seat === 'string' && typeof v.at === 'number' && now - v.at < SEAT_MAX_AGE_MS
    )
  );
};
const writeSeats = (seats: Seats) =>
  safe(() => window.localStorage.setItem(SEATS_KEY, JSON.stringify(seats)), undefined);
const roomOf = async (invite: Invite) => (await roomAddress(invite.signal, invite.secret)).roomId;
async function seatFor(invite: Invite): Promise<string | undefined> {
  return readSeats()[await roomOf(invite)]?.seat;
}
async function keepSeat(invite: Invite, seat: string | null) {
  const room = await roomOf(invite);
  const seats = readSeats();
  if (seat) seats[room] = { seat, at: Date.now() };
  else delete seats[room];
  writeSeats(seats);
}

/** Why a session ended, as the participant reads it. */
export const ENDED_TEXT: Record<EndCause, MessageKey> = {
  ended: 'collabEndedEnded',
  removed: 'collabEndedRemoved',
  replaced: 'collabEndedReplaced',
  revoked: 'collabEndedRevoked',
  'host-left': 'collabEndedHostLeft',
  unreachable: 'collabEndedUnreachable',
  left: 'collabEndedLeft',
  diverged: 'collabEndedDiverged',
  'refused-version': 'collabEndedVersion',
  'refused-closed': 'collabEndedClosed',
  'refused-full': 'collabEndedFull',
  'refused-invite-used': 'collabEndedInviteUsed',
  'refused-removed': 'collabEndedRemoved',
  'refused-name': 'collabEndedName',
  'refused-password': 'collabWrongPassword',
  'refused-locked': 'collabEndedLocked',
  'refused-revoked': 'collabEndedRevoked',
};
/** Endings after which this browser's seat is of no further use. */
const SEAT_GONE: readonly EndCause[] = [
  'ended',
  'removed',
  'replaced',
  'revoked',
  'left',
  'refused-removed',
  'refused-revoked',
];

// ---- the join request: what the join dialog shows before and while connecting ----

export type JoinRequest =
  | { step: 'name'; invite: Invite }
  | { step: 'password'; invite: Invite; wrong: boolean }
  | { step: 'connecting'; invite: Invite }
  | { step: 'invalid'; reason: InviteRefusal };
let joinRequest: JoinRequest | null = null;
const joinListeners = new Set<() => void>();
const setJoin = (next: JoinRequest | null) => {
  joinRequest = next;
  joinListeners.forEach((l) => l());
};
export function useJoinRequest(): JoinRequest | null {
  return useSyncExternalStore(
    (l) => {
      joinListeners.add(l);
      return () => joinListeners.delete(l);
    },
    () => joinRequest
  );
}
export const cancelJoin = () => setJoin(null);

/** What a link asks before connecting: nothing for a seat this browser holds or a personal link. */
async function openInvite(invite: Invite) {
  const seat = await seatFor(invite);
  if (seat || invite.access.kind === 'personal') void join(invite, { ...(seat ? { seat } : {}) });
  else if (invite.access.kind === 'password') setJoin({ step: 'password', invite, wrong: false });
  else setJoin({ step: 'name', invite });
}

/**
 * On start: an invite in the address bar opens the join flow (and leaves the address bar at once, so the secret is
 * not kept in history); otherwise this tab's session rejoins, or the session this browser hosted continues.
 */
let started = false;
export function readInviteOnStart() {
  if (started) return;
  started = true;
  const hash = window.location.hash;
  if (hash.startsWith('#join=')) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    const parsed = parseInvite(hash);
    if (!parsed.ok) setJoin({ step: 'invalid', reason: parsed.reason });
    else void openInvite(parsed.invite);
    return;
  }
  const tabLink = safe(() => window.sessionStorage.getItem(TAB_KEY), null);
  const parsed = tabLink ? parseInvite(tabLink) : null;
  if (parsed?.ok) {
    void seatFor(parsed.invite).then((seat) => {
      if (seat) void join(parsed.invite, { seat });
    });
    return;
  }
  void resumeHost();
}

/** Connect as a participant. The open work is replaced only after the welcome and the person's consent. */
export async function join(invite: Invite, given: { name?: string; password?: string; seat?: string } = {}) {
  const store = getStore();
  setJoin({ step: 'connecting', invite });
  try {
    const session = await joinSession({
      port: store.collabPort(),
      connect: connectTrystero,
      invite,
      ...given,
      onSeat: (seat) => void keepSeat(invite, seat),
      clock,
    });
    store.attachCollab({ role: 'participant', session });
    const unsubscribe = session.subscribe((status) => {
      if (status.phase === 'confirm') {
        safe(() => window.sessionStorage.setItem(TAB_KEY, encodeInvite(invite)), undefined);
        void confirmJoin();
      }
      if (status.phase !== 'ended') return;
      unsubscribe();
      const cause = status.ended as EndCause;
      if (SEAT_GONE.includes(cause)) {
        void keepSeat(invite, null);
        safe(() => window.sessionStorage.removeItem(TAB_KEY), undefined);
      }
      if (cause === 'refused-password') {
        store.clearCollab();
        setJoin({ step: 'password', invite, wrong: true });
      } else if (given.seat && cause === 'refused-closed') {
        // The seat is from an earlier session of this room; ask again as a newcomer.
        void keepSeat(invite, null);
        store.clearCollab();
        void openInvite(invite);
      } else setJoin(null);
    });
  } catch {
    setJoin(null);
    store.notify({ kind: 'error', text: store.translate('collabEndedUnreachable') });
  }
}
/** The welcome arrived: ask before replacing the open work (unless it already is this document: a return). */
async function confirmJoin() {
  const store = getStore();
  const link = store.collabLink();
  if (link?.role !== 'participant') return;
  const status = link.session.status();
  setJoin(null);
  const doc = status.document;
  if (doc && doc.id !== store.get().project.id) {
    const choice = await store.prepareReplacement(
      store.translate('collabJoinReplace', { host: status.hostName ?? '?', title: doc.title })
    );
    if (!choice) {
      await link.session.close();
      store.clearCollab();
      return;
    }
  }
  link.session.accept();
  store.setHome(false);
}

// ---- hosting ----

let recordWrite: Promise<void> = Promise.resolve();
/** Writes in order, so an end's "forget" is never overtaken by an earlier "keep". */
const keepRecord = (record: HostRecord | null) => {
  recordWrite = recordWrite.then(() => saveHostRecord(record, Date.now()));
};

async function host(signal: Signal, resume?: HostRecord): Promise<boolean> {
  const store = getStore();
  try {
    const session = await startHost({
      port: store.collabPort(),
      connect: connectTrystero,
      signal,
      hostUserId: store.get().actorId,
      clock,
      ...(resume ? { resume } : {}),
      onRecord: keepRecord,
    });
    store.attachCollab({ role: 'host', session });
    return true;
  } catch (error) {
    store.notify({
      kind: 'error',
      text: store.translate('collabStartFailed', {
        reason: error instanceof Error ? error.message : String(error),
      }),
    });
    return false;
  }
}

/** Start a session from the open document or a new blank one; the host's current profile is the host. */
export async function startCollab(
  source: 'current' | 'argument' | 'decision',
  signal: Signal
): Promise<boolean> {
  const store = getStore();
  if (source !== 'current') {
    const current = store.get().project;
    const hasWork = current.nodes.length > 1 || current.title !== blankProject(current.mode).title;
    if (hasWork && !(await store.askConfirm(store.translate('newDocumentConfirm')))) return false;
    store.load(blankProject(source));
  }
  writeSignal(signal);
  const ok = await host(signal);
  if (ok) store.setHome(false);
  return ok;
}

/** After a reload: continue the session this browser hosted, if its document is still the open one. */
async function resumeHost() {
  const record = await loadHostRecord(Date.now());
  if (!record) return;
  const store = getStore();
  if (
    record.documentId !== store.get().project.id ||
    !store.get().project.users.some((u) => u.id === record.hostUserId)
  ) {
    keepRecord(null);
    return;
  }
  if (await host(record.signal, record))
    store.notify({ kind: 'info', text: store.translate('collabResumed') });
}

/** Leave (participant) or end for everyone (host); the document stays in this browser. */
export async function closeCollab() {
  const store = getStore();
  const link = store.collabLink();
  safe(() => window.sessionStorage.removeItem(TAB_KEY), undefined);
  if (link) await link.session.close();
  store.clearCollab();
}
