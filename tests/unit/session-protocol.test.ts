/**
 * must: a peer's message is parsed once and refused by name when its shape is wrong or it is too large; a participant
 *       may propose tree edits and their own reviews, never governance or another person's reviews, ballots or
 *       comments (deny by default over every command type); the host admits by seat, by the general token, by a
 *       personal token (first browser only) or by a password token (any browser with the proof, one at a time,
 *       wrong tries up to a lock); a new link for a person revokes the old link and seat; seats and rate are limited;
 *       names stay unique (WG-030, P2P-02, P2P-03)
 * test: tests/unit/session-protocol.test.ts
 * red-against: authorization reading the claimed actor instead of the seat; a comment keeping a forged authorName;
 *              a personal invite taken by a second browser; an unknown token treated as the general one; a missing
 *              password counted as a wrong try; a locked invite opened by the right password; a revoked seat
 *              coming back; the hello's name winning over the host's
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_COMMAND_TYPES,
  MAX_PEER_MESSAGE,
  MAX_SEATS,
  RATE_BURST,
  SCHEMA_VERSION,
  admit,
  applyCommand,
  authorizeCommand,
  commitOrder,
  createBlankProject,
  createHostState,
  issueInvite,
  unlockInvite,
  MAX_PASSWORD_FAILURES,
  documentDigest,
  parseToHost,
  parseToPeer,
  spendRate,
  uniqueName,
} from '../../src/domain/index.ts';
import type { Command, CommandType, HostState, Project, Seat } from '../../src/domain/index.ts';

const NOW = '2026-11-11T10:00:00.000Z';
const base = (): Project =>
  createBlankProject({ projectId: 'p-1', rootId: 'n-root', userId: 'u-host', now: NOW, userName: 'Isäntä' });
const withGuest = (): Project => {
  let p = base();
  p = applyCommand(
    p,
    { type: 'user.add', id: 'u-guest', name: 'Vieras', shares: 1, role: 'editor' },
    { now: NOW, actorId: 'u-host' }
  );
  p = applyCommand(
    p,
    { type: 'node.add', id: 'n-guest', parentId: 'n-root', relation: 'support' },
    { now: NOW, actorId: 'u-guest' }
  );
  p = applyCommand(
    p,
    { type: 'node.add', id: 'n-host', parentId: 'n-root', relation: 'oppose' },
    { now: NOW, actorId: 'u-host' }
  );
  p = applyCommand(
    p,
    {
      type: 'comment.add',
      id: 'c-host',
      nodeId: 'n-root',
      body: 'x',
      authorName: 'Isäntä',
      authorId: 'u-host',
    },
    { now: NOW, actorId: 'u-host' }
  );
  return p;
};
const SEAT = { userId: 'u-guest', name: 'Vieras', personal: false };
const GEN = 'GGGGGGGGGGGGGGGGGGGGGG';
const hello = (extra: Record<string, unknown> = {}) =>
  ({ t: 'hello', protocol: 1, schemaVersion: SCHEMA_VERSION, token: GEN, ...extra }) as {
    t: 'hello';
    protocol: number;
    schemaVersion: number;
    token: string;
    name?: string;
    seat?: string;
    proof?: string;
  };
const T1 = 'AAAAAAAAAAAAAAAAAAAAAA';
const T2 = 'BBBBBBBBBBBBBBBBBBBBBB';
const T3 = 'CCCCCCCCCCCCCCCCCCCCCC';

test('the blank document has a fixed digest (FNV-1a over its JSON)', () => {
  assert.equal(documentDigest(base()), '9bf26cbb');
  const renamed = applyCommand(
    base(),
    { type: 'project.setTitle', title: 'Toinen' },
    { now: NOW, actorId: 'u-host' }
  );
  assert.notEqual(documentDigest(renamed), '9bf26cbb');
});

test('parseToHost accepts the five shapes and refuses the rest by name', () => {
  assert.deepEqual(parseToHost(JSON.stringify({ t: 'probe', nonce: T1 })), {
    ok: true,
    message: { t: 'probe', nonce: T1 },
  });
  assert.deepEqual(parseToHost(JSON.stringify({ t: 'probe', nonce: 'short' })), {
    ok: false,
    reason: 'bad-probe',
  });
  assert.deepEqual(parseToHost(JSON.stringify(hello({ name: 'Maija', extra: 'dropped' }))), {
    ok: true,
    message: { t: 'hello', protocol: 1, schemaVersion: SCHEMA_VERSION, token: GEN, name: 'Maija' },
  });
  assert.deepEqual(parseToHost(JSON.stringify(hello({ token: undefined }))), {
    ok: false,
    reason: 'bad-hello',
  });
  assert.deepEqual(parseToHost(JSON.stringify(hello({ proof: 'NOT-HEX' }))), {
    ok: false,
    reason: 'bad-hello',
  });
  assert.deepEqual(parseToHost(JSON.stringify(hello({ name: 'x'.repeat(121) }))), {
    ok: false,
    reason: 'bad-hello',
  });
  assert.deepEqual(parseToHost(JSON.stringify(hello({ seat: 'nope' }))), { ok: false, reason: 'bad-hello' });
  assert.deepEqual(
    parseToHost(JSON.stringify({ t: 'propose', id: 'x1', command: { type: 'node.remove', id: 'n' } })),
    { ok: true, message: { t: 'propose', id: 'x1', command: { type: 'node.remove', id: 'n' } } }
  );
  assert.deepEqual(
    parseToHost(JSON.stringify({ t: 'propose', id: 'x1', command: { type: 'project.delete' } })),
    {
      ok: false,
      reason: 'bad-propose',
    }
  );
  assert.deepEqual(parseToHost(JSON.stringify({ t: 'propose', id: 'x1', command: 'node.remove' })), {
    ok: false,
    reason: 'bad-propose',
  });
  assert.deepEqual(parseToHost(JSON.stringify({ t: 'commit', seq: 1 })), {
    ok: false,
    reason: 'unknown-type',
  });
  assert.deepEqual(parseToHost('{nope'), { ok: false, reason: 'not-json' });
  assert.deepEqual(parseToHost('[1]'), { ok: false, reason: 'no-type' });
  assert.deepEqual(parseToHost(JSON.stringify({ t: 'ready', pad: 'x'.repeat(MAX_PEER_MESSAGE) })), {
    ok: false,
    reason: 'too-large',
  });
});

test('parseToPeer refuses a commit without seq or with a foreign command, and an unknown refusal', () => {
  const commit = {
    t: 'commit',
    seq: 3,
    command: { type: 'layout.auto' },
    now: NOW,
    actorId: 'u',
    digest: 'abc',
  };
  assert.deepEqual(parseToPeer(JSON.stringify(commit)), { ok: true, message: commit });
  assert.deepEqual(parseToPeer(JSON.stringify({ ...commit, seq: undefined })), {
    ok: false,
    reason: 'bad-commit',
  });
  assert.deepEqual(parseToPeer(JSON.stringify({ ...commit, seq: -1 })), { ok: false, reason: 'bad-commit' });
  assert.deepEqual(parseToPeer(JSON.stringify({ ...commit, command: { type: 'eval' } })), {
    ok: false,
    reason: 'bad-commit',
  });
  assert.deepEqual(parseToPeer(JSON.stringify({ t: 'refuse', reason: 'because' })), {
    ok: false,
    reason: 'bad-refuse',
  });
  assert.deepEqual(parseToPeer(JSON.stringify({ t: 'end', reason: 'removed' })), {
    ok: true,
    message: { t: 'end', reason: 'removed' },
  });
  assert.deepEqual(
    parseToPeer(
      JSON.stringify({ t: 'roster', people: [{ userId: 'u', name: 'A', online: true, host: 'yes' }] })
    ),
    { ok: false, reason: 'bad-roster' }
  );
  assert.deepEqual(
    parseToPeer(
      JSON.stringify({
        t: 'welcome',
        userId: 'u',
        name: 'A',
        seat: T1,
        hostName: 'H',
        seq: 0,
        project: { nodes: [] },
        digest: 'x',
      })
    ),
    {
      ok: false,
      reason: 'bad-welcome',
    }
  );
});

// One representative command per type, written as a participant seated as u-guest would send it.
const SAMPLES: Record<CommandType, Command> = {
  'project.setTitle': { type: 'project.setTitle', title: 'T' },
  'project.setMode': { type: 'project.setMode', mode: 'decision' },
  'project.setTheme': { type: 'project.setTheme', theme: 'dark' },
  'project.setAssessmentWeighting': { type: 'project.setAssessmentWeighting', weighting: 'shares' },
  'project.setVoteWeighting': { type: 'project.setVoteWeighting', weighting: 'shares' },
  'project.setShowAuthors': { type: 'project.setShowAuthors', showAuthors: false },
  'project.setScoring': { type: 'project.setScoring', scoring: 'evidence-v3-links' },
  'node.add': { type: 'node.add', id: 'n-new', parentId: 'n-root', relation: 'support' },
  'node.edit': { type: 'node.edit', id: 'n-host', title: 'x' },
  'node.move': { type: 'node.move', id: 'n-host', parentId: 'n-guest' },
  'node.remove': { type: 'node.remove', id: 'n-host' },
  'node.collapse': { type: 'node.collapse', id: 'n-root', collapsed: true },
  'node.position': { type: 'node.position', positions: {} },
  'node.resize': { type: 'node.resize', id: 'n-host', size: null },
  'node.template': { type: 'node.template', id: 'n-host', credence: 60, influence: 1 },
  'layout.auto': { type: 'layout.auto' },
  'layout.fourWay': { type: 'layout.fourWay', offsets: {} },
  'review.credence': { type: 'review.credence', id: 'v', nodeId: 'n-host', userId: 'u-guest', credence: 70 },
  'review.influence': {
    type: 'review.influence',
    id: 'e',
    subjectType: 'primary',
    subjectId: 'n-host',
    userId: 'u-guest',
    influence: 2,
  },
  'review.personal': {
    type: 'review.personal',
    voteId: 'v',
    assessmentId: 'e',
    nodeId: 'n-host',
    userId: 'u-guest',
    credence: 70,
    influence: 2,
  },
  'review.abstain': { type: 'review.abstain', nodeId: 'n-host', userId: 'u-guest', abstain: true },
  'link.add': { type: 'link.add', id: 'l', sourceId: 'n-guest', targetId: 'n-host', value: 1 },
  'link.update': { type: 'link.update', id: 'l', value: 2 },
  'link.remove': { type: 'link.remove', id: 'l' },
  'comment.add': {
    type: 'comment.add',
    id: 'c',
    nodeId: 'n-root',
    body: 'b',
    authorName: 'Vieras',
    authorId: 'u-guest',
  },
  'comment.remove': { type: 'comment.remove', id: 'c-host' },
  'shared.add': { type: 'shared.add', id: 's', title: 'S', confidence: 50, influence: 1 },
  'shared.update': { type: 'shared.update', id: 's', title: 'S', confidence: 50, influence: 1 },
  'shared.attach': { type: 'shared.attach', id: 's', parentId: 'n-root', nodeId: 'n-s' },
  'shared.detach': { type: 'shared.detach', nodeId: 'n-s' },
  'shared.remove': { type: 'shared.remove', id: 's' },
  'concept.add': { type: 'concept.add', id: 'k', title: 'K' },
  'concept.promote': { type: 'concept.promote', nodeId: 'n-host', conceptId: 'k' },
  'concept.update': { type: 'concept.update', id: 'k', title: 'K' },
  'concept.attach': { type: 'concept.attach', id: 'k', parentId: 'n-root', nodeId: 'n-k' },
  'concept.reuse': {
    type: 'concept.reuse',
    sourceId: 'n-host',
    targetId: 'n-guest',
    conceptId: 'k',
    nodeId: 'n-k',
  },
  'concept.detach': { type: 'concept.detach', nodeId: 'n-k' },
  'concept.remove': { type: 'concept.remove', id: 'k' },
  'user.add': { type: 'user.add', id: 'u-x', name: 'X' },
  'user.rename': { type: 'user.rename', id: 'u-guest', name: 'Vieras 2' },
  'user.setShares': { type: 'user.setShares', id: 'u-guest', shares: 9 },
  'user.remove': { type: 'user.remove', id: 'u-host' },
  'round.start': { type: 'round.start', id: 'r', auditIds: [] },
  'round.close': { type: 'round.close', userId: 'u-guest', auditId: 'a' },
  'ballot.cast': {
    type: 'ballot.cast',
    id: 'b',
    auditId: 'a',
    optionId: 'o',
    userId: 'u-guest',
    preference: 50,
  },
  'ballot.retract': { type: 'ballot.retract', auditId: 'a', optionId: 'o', userId: 'u-guest' },
};
const HOST_ONLY: CommandType[] = [
  'project.setMode',
  'project.setAssessmentWeighting',
  'project.setVoteWeighting',
  'project.setShowAuthors',
  'project.setScoring',
  'user.add',
  'user.setShares',
  'user.remove',
  'round.start',
  'round.close',
  'comment.remove', // the sample removes the host's comment
];

test('every command type has a decision for a participant; governance stays with the host', () => {
  assert.equal(ALL_COMMAND_TYPES.length, Object.keys(SAMPLES).length);
  const project = withGuest();
  for (const type of ALL_COMMAND_TYPES) {
    const verdict = authorizeCommand(project, SAMPLES[type], SEAT);
    assert.equal(verdict.ok, !HOST_ONLY.includes(type), type);
  }
});

test('person fields must name the seat, never the claimed actor', () => {
  const project = withGuest();
  const asHost = (c: Command) => authorizeCommand(project, c, SEAT).ok;
  assert.equal(
    asHost({ type: 'review.credence', id: 'v', nodeId: 'n-host', userId: 'u-host', credence: 1 }),
    false
  );
  assert.equal(asHost({ type: 'review.abstain', nodeId: 'n-host', userId: 'u-host', abstain: true }), false);
  assert.equal(
    asHost({ type: 'ballot.cast', id: 'b', auditId: 'a', optionId: 'o', userId: 'u-host', preference: 1 }),
    false
  );
  assert.equal(asHost({ type: 'user.rename', id: 'u-host', name: 'Minä' }), false);
  assert.equal(authorizeCommand(project, SAMPLES['user.rename'], { ...SEAT, personal: true }).ok, false);
  assert.equal(asHost({ type: 'node.edit', id: 'n-host', authorVisibility: 'anonymous' }), false);
  assert.equal(asHost({ type: 'node.edit', id: 'n-guest', authorVisibility: 'anonymous' }), true);
  assert.equal(
    asHost({
      type: 'comment.add',
      id: 'c',
      nodeId: 'n-root',
      body: 'b',
      authorName: 'Vieras',
      authorId: 'u-host',
    }),
    false
  );
  const forged = authorizeCommand(
    project,
    { type: 'comment.add', id: 'c', nodeId: 'n-root', body: 'b', authorName: 'Isäntä', authorId: 'u-guest' },
    SEAT
  );
  assert.deepEqual(forged, {
    ok: true,
    command: {
      type: 'comment.add',
      id: 'c',
      nodeId: 'n-root',
      body: 'b',
      authorName: 'Vieras',
      authorId: 'u-guest',
    },
  });
});

const fresh = (n: number) => ({ userId: `u-new-${n}`, seat: [T1, T2, T3][n % 3] as string, nowMs: 1000 });
const VERIFIER = 'a'.repeat(64);
const WRONG = 'b'.repeat(64);
const host = (): HostState => createHostState('s', GEN);

test('the general link admits under a unique name; the hello cannot pick an existing profile', () => {
  const project = withGuest();
  const result = admit(host(), project, hello({ name: 'Vieras' }), 'peer-a', fresh(0));
  assert.ok(result.ok);
  assert.equal(result.seat.name, 'Vieras (2)');
  assert.equal(result.seat.userId, 'u-new-0');
  assert.equal(result.seat.personal, false);
  assert.equal(result.seat.joined, false);
  assert.equal(admit(host(), project, hello(), 'peer-a', fresh(0)).ok, false);
  assert.equal((admit(host(), project, hello(), 'peer-a', fresh(0)) as { reason: string }).reason, 'name');
  const closed = { ...host(), generalOpen: false };
  assert.equal(
    (admit(closed, project, hello({ name: 'A' }), 'p', fresh(0)) as { reason: string }).reason,
    'closed'
  );
  assert.equal(
    (admit(host(), project, { ...hello({ name: 'A' }), protocol: 2 }, 'p', fresh(0)) as { reason: string })
      .reason,
    'version'
  );
});

test('a personal token opens only its own door: dropping it does not make a general link', () => {
  const project = withGuest();
  const issued = issueInvite(host(), {
    token: T3,
    mode: 'personal',
    userId: 'u-guest',
    name: 'Vieras',
    verifier: null,
  });
  const other = admit(issued.state, project, hello({ token: T1, name: 'Joku' }), 'peer-x', fresh(0));
  assert.equal(other.ok, false);
  assert.equal((other as { reason: string }).reason, 'closed', 'an unknown token is never the general one');
});

test('a personal invite: the first browser takes the seat, keeps the host’s name and can always come back', () => {
  const project = withGuest();
  const state = issueInvite(host(), {
    token: T3,
    mode: 'personal',
    userId: 'u-guest',
    name: 'Vieras',
    verifier: null,
  }).state;
  const first = admit(state, project, hello({ token: T3, name: 'Joku muu' }), 'peer-a', fresh(1));
  assert.ok(first.ok);
  assert.equal(first.seat.name, 'Vieras');
  assert.equal(first.seat.userId, 'u-guest');
  assert.equal(first.seat.personal, true);
  assert.equal(first.seat.joined, true, 'an existing profile is already in the document');
  const second = admit(first.state, project, hello({ token: T3 }), 'peer-b', fresh(2));
  assert.equal((second as { reason: string }).reason, 'invite-used');
  const back = admit(first.state, project, hello({ token: T3, seat: first.seat.seat }), 'peer-c', fresh(2));
  assert.ok(back.ok);
  assert.equal(back.rejoined, true);
  assert.equal(back.seat.userId, 'u-guest');
  assert.equal(back.state.seats.length, 1);
  assert.equal(back.state.seats[0]?.peerId, 'peer-c');
  const removed = { ...back.state, seats: back.state.seats.map((s) => ({ ...s, removed: true })) };
  assert.equal(
    (admit(removed, project, hello({ seat: first.seat.seat }), 'p', fresh(2)) as { reason: string }).reason,
    'removed'
  );
});

test('a password invite counts wrong tries up to a lock, admits any browser with the proof and takes the seat over', () => {
  const project = withGuest();
  let state = issueInvite(host(), {
    token: T3,
    mode: 'password',
    userId: 'u-k',
    name: 'Kalle',
    verifier: VERIFIER,
  }).state;
  const none = admit(state, project, hello({ token: T3 }), 'p0', fresh(0));
  assert.equal((none as { reason: string }).reason, 'password');
  assert.equal(none.state.invites[0]?.failures, 0, 'asking without a password is not a wrong try');
  for (let i = 1; i < MAX_PASSWORD_FAILURES; i++) {
    const wrong = admit(state, project, hello({ token: T3, proof: WRONG }), `p${i}`, fresh(0));
    assert.equal((wrong as { reason: string }).reason, 'password');
    state = wrong.state;
  }
  const ok = admit(state, project, hello({ token: T3, proof: VERIFIER }), 'phone', fresh(1));
  assert.ok(ok.ok);
  assert.equal(ok.seat.name, 'Kalle');
  assert.equal(ok.state.invites[0]?.failures, 0, 'a success clears the count');
  const laptop = admit(ok.state, project, hello({ token: T3, proof: VERIFIER }), 'laptop', fresh(2));
  assert.ok(laptop.ok);
  assert.equal(laptop.replaced, 'phone', 'the other browser is dropped');
  assert.equal(laptop.seat.seat, ok.seat.seat, 'same person, same seat');
  assert.equal(laptop.state.seats.length, 1);
  state = laptop.state;
  for (let i = 0; i < MAX_PASSWORD_FAILURES; i++)
    state = admit(state, project, hello({ token: T3, proof: WRONG }), 'x', fresh(0)).state;
  const locked = admit(state, project, hello({ token: T3, proof: VERIFIER }), 'y', fresh(0));
  assert.equal((locked as { reason: string }).reason, 'locked', 'locked even for the right password');
  assert.ok(admit(unlockInvite(state, T3), project, hello({ token: T3, proof: VERIFIER }), 'y', fresh(0)).ok);
});

test('a new link for a person revokes the old link and seat; the person keeps their profile', () => {
  const project = withGuest();
  const first = issueInvite(host(), {
    token: T3,
    mode: 'personal',
    userId: 'u-guest',
    name: 'Vieras',
    verifier: null,
  });
  const joined = admit(first.state, project, hello({ token: T3 }), 'old-phone', fresh(1));
  assert.ok(joined.ok);
  const again = issueInvite(joined.state, {
    token: T2,
    mode: 'personal',
    userId: 'u-guest',
    name: 'Vieras',
    verifier: null,
  });
  assert.deepEqual(
    again.dropped.map((s) => s.peerId),
    ['old-phone']
  );
  assert.equal(
    (admit(again.state, project, hello({ token: T3 }), 'z', fresh(0)) as { reason: string }).reason,
    'revoked'
  );
  assert.equal(
    (
      admit(again.state, project, hello({ token: T3, seat: joined.seat.seat }), 'z', fresh(0)) as {
        reason: string;
      }
    ).reason,
    'revoked'
  );
  const fresh2 = admit(again.state, project, hello({ token: T2 }), 'new-phone', fresh(0));
  assert.ok(fresh2.ok);
  assert.equal(fresh2.seat.userId, 'u-guest');
});

test('seats are capped and proposals are rate-limited', () => {
  const project = base();
  let state = host();
  for (let i = 0; i < MAX_SEATS; i++) {
    const r = admit(state, project, hello({ name: `P${i}` }), `peer-${i}`, {
      userId: `u${i}`,
      seat: `${String(i).padStart(2, '0')}${T1.slice(2)}`,
      nowMs: 0,
    });
    assert.ok(r.ok);
    state = r.state;
  }
  assert.equal(
    (admit(state, project, hello({ name: 'Liikaa' }), 'peer-x', fresh(0)) as { reason: string }).reason,
    'full'
  );
  let seat = state.seats[0] as Seat;
  for (let i = 0; i < RATE_BURST; i++) {
    const r = spendRate(seat, 0);
    assert.equal(r.ok, true);
    seat = r.seat;
  }
  assert.equal(spendRate(seat, 0).ok, false);
  assert.equal(spendRate(seat, 99).ok, false, 'under a tenth of a second refills less than one');
  assert.equal(spendRate(seat, 100).ok, true);
});

test('unique names and commit order', () => {
  const project = withGuest();
  assert.equal(uniqueName(project, '  Maija '), 'Maija');
  assert.equal(uniqueName(project, 'vieras'), 'vieras (2)');
  assert.equal(uniqueName(project, 'Maija', ['maija', 'Maija (2)']), 'Maija (3)');
  assert.equal(commitOrder(4, 5), 'apply');
  assert.equal(commitOrder(4, 4), 'stale');
  assert.equal(commitOrder(4, 7), 'gap');
});
