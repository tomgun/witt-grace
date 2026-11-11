/**
 * must: a host and two participants over the loopback network end with byte-identical documents after interleaved
 *       edits; commits carry the host's clock and the seat's id; a participant applies its own proposal only when the
 *       host commits it; a refused or conflicting proposal comes back as a named reject; a gap or a drifted copy is
 *       healed by a snapshot; a forged host is ignored; a personal invite's browser comes back after closing; a
 *       password invite moves between browsers and locks on wrong passwords; a new link drops the old browser;
 *       the host reloading continues the same links while participants wait and reconnect; a host that never
 *       returns ends the wait and everyone keeps the document (WG-030, P2P-01, P2P-02)
 * test: tests/unit/session-flow.test.ts
 * red-against: the participant applying its proposal optimistically and again on commit (a duplicate node); the
 *              participant stamping its own clock; seq ignored; the welcome accepted from a peer that is not the host;
 *              the joiner's profile added before they agreed to join; a returning browser added as a second person;
 *              a resumed host with a new key that participants accept; proposals sent into the void while reconnecting
 * Note: host keys and tokens come from WebCrypto (the controller's job); no assertion depends on their values.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, createBlankProject, encodeInvite, parseInvite } from '../../src/domain/index.ts';
import type { Command, CommandContext, Project } from '../../src/domain/index.ts';
import { LoopbackHub } from '../../src/lib/p2p/network.ts';
import type { ConnectNetwork, PeerNetwork } from '../../src/lib/p2p/network.ts';
import { joinSession, startHost } from '../../src/lib/p2p/session.ts';
import type { CollabClock, CollabNotice, DocumentPort, HostRecord } from '../../src/lib/p2p/session.ts';

class Doc implements DocumentPort {
  project: Project;
  constructor(project: Project) {
    this.project = project;
  }
  current = () => this.project;
  apply = (command: Command, ctx: CommandContext) =>
    (this.project = applyCommand(this.project, command, ctx));
  adopt = (project: Project) => void (this.project = project);
}
function makeClock(prefix: string): CollabClock & { timers: (() => void)[] } {
  let n = 0;
  let minute = 0;
  const timers: (() => void)[] = [];
  return {
    timers,
    nowIso: () => `2026-11-11T10:${String(minute++ % 60).padStart(2, '0')}:00.000Z`,
    nowMs: () => n * 1000,
    newId: () => `${prefix}-${++n}`,
    schedule: (run) => {
      timers.push(run);
      return () => void timers.splice(timers.indexOf(run), 1);
    },
  };
}
const hostDoc = () =>
  createBlankProject({
    projectId: 'p-1',
    rootId: 'n-root',
    userId: 'u-host',
    now: '2026-11-11T09:00:00.000Z',
    userName: 'Isäntä',
  });
/** A local blank work the participant had open before joining. */
const ownDoc = () =>
  createBlankProject({
    projectId: 'p-own',
    rootId: 'n-own',
    userId: 'u-own',
    now: '2026-11-11T09:00:00.000Z',
  });

function network(hub: LoopbackHub, peerId: string): ConnectNetwork {
  return async () => hub.join(peerId);
}
/** Deliver until quiet, letting WebCrypto's promises settle between rounds. */
async function settle(hub: LoopbackHub) {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (hub.flush() === 0) {
      await new Promise((r) => setTimeout(r, 0));
      if (hub.queue.length === 0) return;
    }
  }
}
/**
 * Deliver until `done` holds. The host's signature and its check run on WebCrypto's thread pool, so a loaded test
 * process needs an unknown number of turns; bounded by the turn count, never by the clock.
 */
async function until(hub: LoopbackHub, done: () => boolean) {
  for (let i = 0; i < 5000 && !done(); i++) {
    hub.flush();
    await new Promise((r) => setTimeout(r, i < 50 ? 0 : 2));
  }
  await settle(hub);
}
const relay = { strategy: 'relay' as const, urls: ['ws://127.0.0.1:8787'] };

const ROUNDS = 1000;
async function setup() {
  const hub = new LoopbackHub();
  const host = new Doc(hostDoc());
  const records: (HostRecord | null)[] = [];
  let hostNet: PeerNetwork | null = null;
  const session = await startHost({
    port: host,
    connect: async () => (hostNet = hub.join('H')),
    signal: relay,
    hostUserId: 'u-host',
    clock: makeClock('h'),
    onRecord: (r) => records.push(r),
    passwordRounds: ROUNDS,
  });
  const parsed = parseInvite(session.status().link as string);
  assert.ok(parsed.ok);
  return {
    hub,
    host,
    session,
    invite: parsed.invite,
    records,
    hostNet: () => hostNet as unknown as PeerNetwork,
  };
}
async function join(
  hub: LoopbackHub,
  invite: Parameters<typeof joinSession>[0]['invite'],
  peerId: string,
  given: string | { name?: string; password?: string; seat?: string } = {}
) {
  const doc = new Doc(ownDoc());
  const seats: string[] = [];
  const clock = makeClock(peerId.toLowerCase());
  const session = await joinSession({
    port: doc,
    connect: network(hub, peerId),
    invite,
    ...(typeof given === 'string' ? { name: given } : given),
    onSeat: (s) => seats.push(s),
    clock,
    passwordRounds: ROUNDS,
  });
  await until(hub, () => session.status().phase !== 'connecting');
  return { doc, session, seats, clock };
}

test('two participants and the host converge; commits carry the host clock and the seat id', async () => {
  const { hub, host, session, invite } = await setup();
  const a = await join(hub, invite, 'A', 'Aino');
  assert.equal(a.session.status().phase, 'confirm');
  assert.equal(a.session.status().hostName, 'Isäntä');
  assert.equal(a.doc.project.id, 'p-own', 'nothing replaced before the person agrees');
  assert.equal(host.project.users.length, 1, 'no profile before the person agrees');
  a.session.accept();
  await settle(hub);
  assert.equal(a.doc.project.id, 'p-1');
  const aino = host.project.users.find((u) => u.name === 'Aino');
  assert.ok(aino);
  assert.equal(a.session.status().selfUserId, aino.id);

  const b = await join(hub, invite, 'B', 'Aino');
  b.session.accept();
  await settle(hub);
  assert.equal(b.session.status().selfName, 'Aino (2)');

  // Interleaved: the host edits locally, both participants propose.
  const ctx = { now: '2026-11-11T11:00:00.000Z', actorId: 'u-host' };
  const add: Command = {
    type: 'node.add',
    id: 'n-h',
    parentId: 'n-root',
    relation: 'support',
    title: 'Isännän',
  };
  session.localApplied(add, ctx, host.apply(add, ctx));
  a.session.propose({ type: 'node.add', id: 'n-a', parentId: 'n-root', relation: 'oppose', title: 'Ainon' });
  b.session.propose({ type: 'node.add', id: 'n-b', parentId: 'n-h', relation: 'support', title: 'B:n' });
  assert.equal(
    a.doc.project.nodes.some((n) => n.id === 'n-a'),
    false,
    'not applied before the commit'
  );
  assert.equal(a.session.status().pending, 1);
  await settle(hub);
  assert.equal(a.session.status().pending, 0);
  assert.equal(JSON.stringify(a.doc.project), JSON.stringify(host.project));
  assert.equal(JSON.stringify(b.doc.project), JSON.stringify(host.project));
  assert.equal(host.project.nodes.filter((n) => n.id === 'n-a').length, 1);
  const nodeA = host.project.nodes.find((n) => n.id === 'n-a');
  assert.equal(nodeA?.createdBy, aino.id);
  assert.match(host.project.updatedAt, /^2026-11-11T10:/, 'the host clock, not the participant’s');
  assert.deepEqual(
    session.status().people.map((p) => [p.name, p.host, p.online]),
    [
      ['Isäntä', true, true],
      ['Aino', false, true],
      ['Aino (2)', false, true],
    ]
  );
  assert.deepEqual(a.session.status().people, session.status().people);
});

test('refused, forbidden and conflicting proposals come back as named rejects', async () => {
  const { hub, host, invite } = await setup();
  const a = await join(hub, invite, 'A', 'Aino');
  a.session.accept();
  const b = await join(hub, invite, 'B', 'Bertta');
  b.session.accept();
  await settle(hub);
  const notices: CollabNotice[] = [];
  a.session.onNotice((n) => notices.push(n));
  a.session.propose({ type: 'node.add', id: 'n-x', parentId: 'n-root', relation: 'support' });
  await settle(hub);
  // B removes the node while A edits it: the host orders B first, A's edit is refused by the domain.
  b.session.propose({ type: 'node.remove', id: 'n-x' });
  a.session.propose({ type: 'node.edit', id: 'n-x', title: 'Myöhässä' });
  a.session.propose({ type: 'user.setShares', id: a.session.status().selfUserId as string, shares: 50 });
  await settle(hub);
  assert.deepEqual(
    notices.map((n) => (n.kind === 'rejected' ? n.reason : n.kind)),
    ['refused', 'forbidden']
  );
  assert.equal(a.session.status().pending, 0);
  assert.equal(JSON.stringify(a.doc.project), JSON.stringify(host.project));
});

test('a gap in the commits is healed by a snapshot', async () => {
  const { hub, host, session, invite } = await setup();
  const a = await join(hub, invite, 'A', 'Aino');
  a.session.accept();
  await settle(hub);
  const ctx = { now: '2026-11-11T11:00:00.000Z', actorId: 'u-host' };
  const first: Command = { type: 'node.add', id: 'n-1', parentId: 'n-root', relation: 'support' };
  session.localApplied(first, ctx, host.apply(first, ctx));
  hub.queue = []; // the first commit is lost on the way
  const second: Command = { type: 'node.add', id: 'n-2', parentId: 'n-root', relation: 'support' };
  session.localApplied(second, ctx, host.apply(second, ctx));
  const delivered = hub.queue.find((q) => q.to === 'A');
  await settle(hub);
  assert.equal(JSON.stringify(a.doc.project), JSON.stringify(host.project));
  // A commit delivered twice is recognised by its number and ignored: no resync request goes out.
  assert.ok(delivered);
  hub.queue.push(delivered);
  hub.flush(1);
  assert.deepEqual(hub.queue, []);
  // A drifted copy (edited behind the protocol's back) is replaced at the next commit's digest check.
  a.doc.project = applyCommand(
    a.doc.project,
    { type: 'project.setTitle', title: 'Salaa' },
    { now: ctx.now, actorId: 'u-host' }
  );
  const third: Command = { type: 'node.add', id: 'n-3', parentId: 'n-root', relation: 'oppose' };
  session.localApplied(third, ctx, host.apply(third, ctx));
  await settle(hub);
  assert.equal(JSON.stringify(a.doc.project), JSON.stringify(host.project));
});

test('a personal invite fixes the name, the first browser keeps the seat and comes back after closing', async () => {
  const { hub, host, session } = await setup();
  const personal = parseInvite(await session.invite({ name: 'Kalle' }, { mode: 'personal' }));
  assert.ok(personal.ok);
  assert.equal(personal.invite.access.kind, 'personal');
  const k = await join(hub, personal.invite, 'K', 'Ihan muu nimi');
  k.session.accept();
  await settle(hub);
  assert.equal(k.session.status().selfName, 'Kalle');
  assert.deepEqual(
    host.project.users.map((u) => u.name),
    ['Isäntä', 'Kalle']
  );
  const other = await join(hub, personal.invite, 'K2');
  assert.equal(other.session.status().ended, 'refused-invite-used', 'another browser cannot use it');
  assert.equal(session.status().invites[0]?.claimed, true);

  // Kalle closes the tab and opens the same link later in the same browser (which kept the seat).
  await k.session.close();
  await settle(hub);
  const back = await join(hub, personal.invite, 'K3', { seat: k.seats[0] as string });
  assert.equal(back.session.status().selfName, 'Kalle');
  back.session.accept();
  await settle(hub);
  assert.deepEqual(
    host.project.users.map((u) => u.name),
    ['Isäntä', 'Kalle'],
    'the same person, no duplicate'
  );
  assert.equal(back.session.status().selfUserId, k.session.status().selfUserId);

  const merged = applyCommand(
    host.project,
    { type: 'project.setTitle', title: 'AI-yhdistetty' },
    { now: '2026-11-11T12:00:00.000Z', actorId: 'u-host' }
  );
  host.project = merged;
  session.replaced(merged);
  await settle(hub);
  assert.equal(back.doc.project.title, 'AI-yhdistetty');
  assert.equal(JSON.stringify(back.doc.project), JSON.stringify(host.project));
});

test('a password invite works from any browser with the password, one at a time; wrong passwords lock it', async () => {
  const { hub, host, session } = await setup();
  const link = await session.invite(
    { name: 'Kalle' },
    { mode: 'password', password: 'pilvi-kartta-norsu-syksy' }
  );
  const parsed = parseInvite(link);
  assert.ok(parsed.ok);
  assert.equal(parsed.invite.access.kind, 'password');
  const wrong = await join(hub, parsed.invite, 'W', { password: 'pilvi kartta norsu kevät' });
  assert.equal(wrong.session.status().ended, 'refused-password');
  const phone = await join(hub, parsed.invite, 'P', { password: 'Pilvi Kartta Norsu Syksy' });
  assert.equal(phone.session.status().selfName, 'Kalle');
  phone.session.accept();
  await settle(hub);
  const laptop = await join(hub, parsed.invite, 'L', { password: 'pilvi-kartta-norsu-syksy' });
  laptop.session.accept();
  await settle(hub);
  assert.equal(phone.session.status().ended, 'replaced', 'the phone is told the laptop took over');
  assert.equal(laptop.session.status().selfUserId, phone.session.status().selfUserId);
  assert.deepEqual(
    host.project.users.map((u) => u.name),
    ['Isäntä', 'Kalle']
  );
  for (let i = 0; i < 5; i++) await join(hub, parsed.invite, `X${i}`, { password: `väärä ${i}` });
  assert.equal(session.status().invites[0]?.locked, true);
  const right = await join(hub, parsed.invite, 'R', { password: 'pilvi-kartta-norsu-syksy' });
  assert.equal(right.session.status().ended, 'refused-locked');
  session.unlock(parsed.invite.access.token);
  const again = await join(hub, parsed.invite, 'R2', { password: 'pilvi-kartta-norsu-syksy' });
  assert.equal(again.session.status().phase, 'confirm');
});

test('a new link for a person replaces the old link and drops the old browser; the profile and reviews stay', async () => {
  const { hub, host, session } = await setup();
  const first = parseInvite(await session.invite({ name: 'Kalle' }, { mode: 'personal' }));
  assert.ok(first.ok);
  const k = await join(hub, first.invite, 'K');
  k.session.accept();
  await settle(hub);
  const kalle = k.session.status().selfUserId as string;
  const second = parseInvite(await session.invite({ userId: kalle }, { mode: 'personal' }));
  assert.ok(second.ok);
  await settle(hub);
  assert.equal(k.session.status().ended, 'revoked');
  const old = await join(hub, first.invite, 'K2', { seat: k.seats[0] as string });
  assert.equal(old.session.status().ended, 'refused-revoked');
  const fresh = await join(hub, second.invite, 'K3');
  fresh.session.accept();
  await settle(hub);
  assert.equal(fresh.session.status().selfUserId, kalle);
  assert.deepEqual(
    host.project.users.map((u) => u.name),
    ['Isäntä', 'Kalle']
  );
  assert.deepEqual(
    session.status().invites.map((i) => i.token),
    [second.invite.access.token],
    'the old link is gone'
  );
});

test('the host reloads: the same links and seats continue, participants reconnect and edits flow again', async () => {
  const { hub, host, session, invite, records, hostNet } = await setup();
  const a = await join(hub, invite, 'A', 'Aino');
  a.session.accept();
  await settle(hub);
  const record = records.at(-1);
  assert.ok(record);
  assert.equal(record.documentId, 'p-1');
  // The tab closes without saying goodbye.
  await hostNet().leave();
  await settle(hub);
  assert.equal(a.session.status().phase, 'reconnecting');
  a.session.propose({ type: 'project.setTitle', title: 'Ei mene' });
  assert.equal(a.session.status().pending, 0, 'nothing is sent while the host is away');
  void session;
  const resumed = await startHost({
    port: host,
    connect: async () => hub.join('H-again'),
    signal: relay,
    hostUserId: 'ignored',
    clock: makeClock('h2'),
    resume: record,
  });
  await until(hub, () => a.session.status().phase === 'active');
  assert.equal(resumed.status().link, encodeInvite(invite), 'the general link is the same');
  a.session.propose({ type: 'node.add', id: 'n-back', parentId: 'n-root', relation: 'support' });
  await settle(hub);
  assert.equal(
    host.project.nodes.some((n) => n.id === 'n-back'),
    true
  );
  assert.equal(JSON.stringify(a.doc.project), JSON.stringify(host.project));
  await resumed.close();
  await settle(hub);
  assert.equal(a.session.status().ended, 'ended');
});

test('a host that never comes back ends the wait', async () => {
  const { hub, invite, hostNet } = await setup();
  const a = await join(hub, invite, 'A', 'Aino');
  a.session.accept();
  await settle(hub);
  await hostNet().leave();
  await settle(hub);
  assert.equal(a.session.status().phase, 'reconnecting');
  a.clock.timers.at(-1)?.();
  await settle(hub);
  assert.equal(a.session.status().ended, 'host-left');
  assert.equal(a.doc.project.id, 'p-1');
});

test('a peer that is not the host cannot take over, and the host leaving ends the session', async () => {
  const { hub, invite, session } = await setup();
  // An impostor knows the link (so it is in the room) but not the host's key: it answers probes with its own key.
  const impostor: PeerNetwork = hub.join('M');
  impostor.onMessage((from, raw) => {
    const m = JSON.parse(raw) as { t: string };
    if (m.t === 'probe')
      impostor.sendTo(from, JSON.stringify({ t: 'host', sessionId: 'fake', key: 'AAAA', signature: 'AAAA' }));
  });
  impostor.onPeer((e) => {
    if (e.kind === 'joined') impostor.sendTo(e.peerId, JSON.stringify({ t: 'end', reason: 'removed' }));
  });
  const a = await join(hub, invite, 'A', 'Aino');
  assert.equal(a.session.status().phase, 'confirm', 'the real host welcomed; the impostor was ignored');
  a.session.accept();
  await settle(hub);
  impostor.sendTo('A', JSON.stringify({ t: 'end', reason: 'removed' }));
  await settle(hub);
  assert.equal(a.session.status().phase, 'active');
  await session.close();
  await settle(hub);
  assert.equal(a.session.status().ended, 'ended');
  assert.equal(a.doc.project.id, 'p-1', 'the participant keeps the document');
});

test('removing a participant ends it for them; an unreachable host times out without touching the work', async () => {
  const { hub, session, invite } = await setup();
  const a = await join(hub, invite, 'A', 'Aino');
  a.session.accept();
  await settle(hub);
  session.remove(a.session.status().selfUserId as string);
  await settle(hub);
  assert.equal(a.session.status().ended, 'removed');

  const lonely = new LoopbackHub();
  const doc = new Doc(ownDoc());
  const clock = makeClock('z');
  const s = await joinSession({ port: doc, connect: network(lonely, 'Z'), invite, name: 'Z', clock });
  await settle(lonely);
  assert.equal(s.status().phase, 'connecting');
  clock.timers[0]?.();
  await settle(lonely);
  assert.equal(s.status().ended, 'unreachable');
  assert.equal(doc.project.id, 'p-own');
});
