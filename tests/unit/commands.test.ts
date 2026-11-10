/**
 * must: every command produces exactly the document the prototype's mutation API produces for the same edit (same ids,
 *       same clock), never mutates its input, and refuses the edits the prototype refuses (G-01, G-04, G-05, U-01, U-02,
 *       V-02, V-04)
 * test: tests/unit/commands.test.ts (the prototype engine is loaded as the oracle)
 * red-against: a child added under a locked shared reason, a vote kept on a node turned into a value, a ballot accepted
 *              from an AI profile, an option moved during an open round, the input project edited in place
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { applyCommand, createBlankProject, parseProject } from '../../src/domain/index.ts';
import type { Command, Project } from '../../src/domain/index.ts';

const FIXED = '2026-11-08T10:00:00.000Z';
const ACTOR_NOW = { now: FIXED };

// The oracle: the frozen prototype engine with the same deterministic ids and clock the golden generator uses.
const issued: string[] = [];
let counter = 0;
const realRandomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);
const RealDate = Date;
function withOracle<T>(fn: () => T): T {
  globalThis.crypto.randomUUID = (() => {
    const id = `cmd-${String(++counter).padStart(4, '0')}`;
    issued.push(id);
    return id;
  }) as typeof globalThis.crypto.randomUUID;
  globalThis.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      // @ts-expect-error forwarding the variadic Date constructor
      super(...(args.length ? args : [FIXED]));
    }
    static override now() {
      return new RealDate(FIXED).getTime();
    }
  } as DateConstructor;
  try {
    return fn();
  } finally {
    globalThis.crypto.randomUUID = realRandomUUID;
    globalThis.Date = RealDate;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const core: any = createRequire(import.meta.url)(
  path.join(process.cwd(), 'witt-grace-gpt-proto', 'src', 'core.js')
);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The prototype's mutation wrapper: tag edits, re-validate, stamp updatedAt. */
function protoMutation(project: Project, actorId: string, operation: (p: Project) => void): Project {
  const before = JSON.stringify(project);
  const draft = clone(project);
  issued.length = 0;
  withOracle(() => operation(draft));
  const previous = new Map(project.nodes.map((n) => [n.id, n]));
  for (const n of draft.nodes) {
    const prev = previous.get(n.id);
    if (
      prev &&
      (['title', 'details', 'semanticType', 'constraintStatus'] as const).some((k) => n[k] !== prev[k])
    )
      n.lastEditedBy = actorId;
  }
  const previousLinks = new Set(project.links.map((l) => l.id));
  for (const link of draft.links)
    if (!previousLinks.has(link.id) && !link.createdBy) link.createdBy = actorId;
  const next = core.validateProject(draft) as Project;
  if (JSON.stringify(next) === before) return project;
  next.updatedAt = FIXED;
  return next;
}

interface Pair {
  oracle: Project;
  mine: Project;
  actorId: string;
}
function start(mode: 'argument' | 'decision'): Pair {
  issued.length = 0;
  const oracle = withOracle(() => core.validateProject(core.createBlankProject(mode)) as Project);
  const [userId, rootId, projectId] = issued as [string, string, string];
  const mine = createBlankProject({ mode, projectId, rootId, userId, now: FIXED });
  assert.deepEqual(clone(mine), oracle, 'blank documents match');
  return { oracle, mine, actorId: userId };
}
/** Run the same edit through the oracle and through a command; `command` receives the ids the oracle issued. */
function step(
  pair: Pair,
  label: string,
  oracleOp: (p: Project) => void,
  command: (ids: string[]) => Command
): void {
  const oracle = protoMutation(pair.oracle, pair.actorId, oracleOp);
  const ids = [...issued];
  const before = JSON.stringify(pair.mine);
  const mine = applyCommand(pair.mine, command(ids), { ...ACTOR_NOW, actorId: pair.actorId });
  assert.equal(JSON.stringify(pair.mine), before, `${label}: the input is not mutated`);
  assert.deepEqual(clone(mine), oracle, label);
  pair.oracle = oracle;
  pair.mine = mine;
}
const root = (p: Project) => p.nodes.find((n) => n.parentId === null)!;
const byTitle = (p: Project, title: string) => p.nodes.find((n) => n.title === title)!;

test('argument mode: nodes, reviews, links, comments, concepts, people and layout match the prototype step by step', () => {
  const pair = start('argument');
  step(
    pair,
    'add support',
    (p) => core.addChild(p, root(p).id, 'support', pair.actorId),
    ([id]) => ({ type: 'node.add', id: id!, parentId: root(pair.mine).id, relation: 'support' })
  );
  step(
    pair,
    'add oppose',
    (p) => core.addChild(p, root(p).id, 'oppose', pair.actorId),
    ([id]) => ({ type: 'node.add', id: id!, parentId: root(pair.mine).id, relation: 'oppose' })
  );
  const support = () => byTitle(pair.mine, 'Puoltava argumentti');
  const oppose = () => byTitle(pair.mine, 'Vastustava argumentti');
  step(
    pair,
    'edit title and details',
    (p) => {
      const n = byTitle(p, 'Puoltava argumentti');
      n.title = 'Hinta on alhainen';
      n.details = 'Vertailu 2026';
    },
    () => ({ type: 'node.edit', id: support().id, title: 'Hinta on alhainen', details: 'Vertailu 2026' })
  );
  const priced = () => byTitle(pair.mine, 'Hinta on alhainen');
  step(
    pair,
    'add grandchild',
    (p) => core.addChild(p, byTitle(p, 'Hinta on alhainen').id, 'support', pair.actorId),
    ([id]) => ({
      type: 'node.add',
      id: id!,
      parentId: priced().id,
      relation: 'support',
      title: 'Puoltava argumentti',
    })
  );
  step(
    pair,
    'credence vote',
    (p) => core.upsertVote(p, byTitle(p, 'Hinta on alhainen').id, pair.actorId, 80),
    ([id]) => ({ type: 'review.credence', id: id!, nodeId: priced().id, userId: pair.actorId, credence: 80 })
  );
  step(
    pair,
    'credence vote again (no new id)',
    (p) => core.upsertVote(p, byTitle(p, 'Hinta on alhainen').id, pair.actorId, 70),
    () => ({ type: 'review.credence', id: 'unused', nodeId: priced().id, userId: pair.actorId, credence: 70 })
  );
  step(
    pair,
    'influence review',
    (p) => core.upsertEdgeAssessment(p, 'primary', byTitle(p, 'Hinta on alhainen').id, pair.actorId, 3.5),
    ([id]) => ({
      type: 'review.influence',
      id: id!,
      subjectType: 'primary',
      subjectId: priced().id,
      userId: pair.actorId,
      influence: 3.5,
    })
  );
  step(
    pair,
    'personal assessment on the objection',
    (p) => core.applyPersonalAssessment(p, byTitle(p, 'Vastustava argumentti').id, pair.actorId, 60, -2),
    (ids) => ({
      type: 'review.personal',
      voteId: ids[0]!,
      assessmentId: ids[1]!,
      nodeId: oppose().id,
      userId: pair.actorId,
      credence: 60,
      influence: -2,
    })
  );
  step(
    pair,
    'template assessment',
    (p) => core.applyAssessment(p, byTitle(p, 'Vastustava argumentti').id, 55, 1.5),
    () => ({ type: 'node.template', id: oppose().id, credence: 55, influence: 1.5 })
  );
  step(
    pair,
    'secondary link',
    (p) =>
      core.addSignedLink(
        p,
        byTitle(p, 'Puoltava argumentti').id,
        byTitle(p, 'Vastustava argumentti').id,
        -2.5
      ),
    ([id]) => ({
      type: 'link.add',
      id: id!,
      sourceId: byTitle(pair.mine, 'Puoltava argumentti').id,
      targetId: oppose().id,
      value: -2.5,
    })
  );
  const link = () => pair.mine.links[0]!;
  step(
    pair,
    'review the link',
    (p) => core.upsertEdgeAssessment(p, 'secondary', p.links[0]!.id, pair.actorId, -1),
    ([id]) => ({
      type: 'review.influence',
      id: id!,
      subjectType: 'secondary',
      subjectId: link().id,
      userId: pair.actorId,
      influence: -1,
    })
  );
  step(
    pair,
    'update the link',
    (p) => core.updateSignedLink(p, p.links[0]!.id, 4),
    () => ({ type: 'link.update', id: link().id, value: 4 })
  );
  step(
    pair,
    'comment',
    (p) => core.addComment(p, root(p).id, '  Hyvä alku  ', 'Minä', pair.actorId),
    ([id]) => ({
      type: 'comment.add',
      id: id!,
      nodeId: root(pair.mine).id,
      body: '  Hyvä alku  ',
      authorName: 'Minä',
      authorId: pair.actorId,
    })
  );
  step(
    pair,
    'add a person',
    (p) => {
      p.users.push({ id: core.uid(), name: 'Bea', shares: 1, role: 'editor' });
    },
    ([id]) => ({ type: 'user.add', id: id!, name: 'Bea' })
  );
  step(
    pair,
    'add an AI profile',
    (p) => {
      p.users.push({ id: core.uid(), name: 'Malli', shares: 0, role: 'viewer', profileKind: 'ai' });
    },
    ([id]) => ({ type: 'user.add', id: id!, name: 'Malli', profileKind: 'ai' })
  );
  step(
    pair,
    'rename a person',
    (p) => {
      p.users.find((u) => u.name === 'Bea')!.name = 'Beatrice';
    },
    () => ({ type: 'user.rename', id: pair.mine.users.find((u) => u.name === 'Bea')!.id, name: 'Beatrice' })
  );
  step(
    pair,
    'set shares',
    (p) => {
      p.users.find((u) => u.name === 'Beatrice')!.shares = 3;
    },
    () => ({ type: 'user.setShares', id: pair.mine.users.find((u) => u.name === 'Beatrice')!.id, shares: 3 })
  );
  step(
    pair,
    'promote and reuse a claim as a concept',
    (p) => core.reuseClaimAt(p, byTitle(p, 'Puoltava argumentti').id, root(p).id, pair.actorId),
    (ids) => ({
      type: 'concept.reuse',
      sourceId: byTitle(pair.mine, 'Puoltava argumentti').id,
      targetId: root(pair.mine).id,
      conceptId: ids[0]!,
      nodeId: ids[1]!,
    })
  );
  step(
    pair,
    'rename the concept',
    (p) => core.updateReasonConcept(p, p.reasonConcepts![0]!.id, 'Toistuva peruste'),
    () => ({ type: 'concept.update', id: pair.mine.reasonConcepts![0]!.id, title: 'Toistuva peruste' })
  );
  step(
    pair,
    'collapse',
    (p) => {
      byTitle(p, 'Hinta on alhainen').collapsed = true;
    },
    () => ({ type: 'node.collapse', id: priced().id, collapsed: true })
  );
  step(
    pair,
    'auto layout',
    (p) => core.autoLayout(p),
    () => ({ type: 'layout.auto' })
  );
  step(
    pair,
    'move a node',
    (p) => core.moveNode(p, byTitle(p, 'Hinta on alhainen').id, byTitle(p, 'Vastustava argumentti').id),
    () => ({ type: 'node.move', id: priced().id, parentId: oppose().id })
  );
  step(
    pair,
    'switch to decision and back',
    (p) => {
      p.mode = 'decision';
      root(p).kind = 'decision';
    },
    () => ({ type: 'project.setMode', mode: 'decision' })
  );
  step(
    pair,
    'back to argument',
    (p) => {
      p.mode = 'argument';
      root(p).kind = 'claim';
    },
    () => ({ type: 'project.setMode', mode: 'argument' })
  );
  step(
    pair,
    'remove the link',
    (p) => core.removeLink(p, p.links[0]!.id),
    () => ({ type: 'link.remove', id: link().id })
  );
  step(
    pair,
    'detach the concept use',
    (p) => core.detachReasonConcept(p, p.nodes.filter((n) => n.reasonConceptId).at(-1)!.id),
    () => ({ type: 'concept.detach', nodeId: pair.mine.nodes.filter((n) => n.reasonConceptId).at(-1)!.id })
  );
  step(
    pair,
    'remove a subtree',
    (p) => core.removeSubtree(p, byTitle(p, 'Vastustava argumentti').id),
    () => ({ type: 'node.remove', id: oppose().id })
  );
  step(
    pair,
    'set title',
    (p) => {
      p.title = 'Hintapohdinta';
    },
    () => ({ type: 'project.setTitle', title: ' Hintapohdinta ' })
  );
  step(
    pair,
    'settings',
    (p) => {
      p.settings.assessmentWeighting = 'shares';
    },
    () => ({ type: 'project.setAssessmentWeighting', weighting: 'shares' })
  );
});

test('decision mode: options, groups, gates, shared reasons and ballot rounds match the prototype', () => {
  const pair = start('decision');
  const me = pair.actorId;
  step(
    pair,
    'option A',
    (p) => core.addChild(p, root(p).id, 'option', me),
    ([id]) => ({ type: 'node.add', id: id!, parentId: root(pair.mine).id, relation: 'option' })
  );
  step(
    pair,
    'rename A',
    (p) => {
      p.nodes[1]!.title = 'A';
    },
    () => ({ type: 'node.edit', id: pair.mine.nodes[1]!.id, title: 'A' })
  );
  step(
    pair,
    'group',
    (p) => core.addChild(p, root(p).id, 'group', me),
    ([id]) => ({ type: 'node.add', id: id!, parentId: root(pair.mine).id, relation: 'group' })
  );
  const group = () => byTitle(pair.mine, 'Uusi vaihtoehtoryhmä');
  step(
    pair,
    'option B in group',
    (p) => core.addChild(p, byTitle(p, 'Uusi vaihtoehtoryhmä').id, 'option', me),
    ([id]) => ({ type: 'node.add', id: id!, parentId: group().id, relation: 'option' })
  );
  step(
    pair,
    'rename B',
    (p) => {
      p.nodes.at(-1)!.title = 'B';
    },
    () => ({ type: 'node.edit', id: pair.mine.nodes.at(-1)!.id, title: 'B' })
  );
  const a = () => byTitle(pair.mine, 'A');
  const b = () => byTitle(pair.mine, 'B');
  step(
    pair,
    'gate under A',
    (p) => core.addChild(p, byTitle(p, 'A').id, 'support', me),
    ([id]) => ({ type: 'node.add', id: id!, parentId: a().id, relation: 'support' })
  );
  step(
    pair,
    'name the gate',
    (p) => {
      p.nodes.at(-1)!.title = 'Lupa saadaan';
    },
    () => ({ type: 'node.edit', id: pair.mine.nodes.at(-1)!.id, title: 'Lupa saadaan' })
  );
  const gate = () => byTitle(pair.mine, 'Lupa saadaan');
  step(
    pair,
    'vote on the future gate',
    (p) => core.upsertVote(p, byTitle(p, 'Lupa saadaan').id, me, 90),
    ([id]) => ({ type: 'review.credence', id: id!, nodeId: gate().id, userId: me, credence: 90 })
  );
  step(
    pair,
    'turn it into a prerequisite (vote removed)',
    (p) => {
      const n = byTitle(p, 'Lupa saadaan');
      n.semanticType = 'prerequisite';
      n.constraintStatus = n.constraintStatus || 'unknown';
      p.votes = p.votes.filter((v) => v.nodeId !== n.id);
    },
    () => ({ type: 'node.edit', id: gate().id, semanticType: 'prerequisite' })
  );
  step(
    pair,
    'mark it unmet',
    (p) => {
      byTitle(p, 'Lupa saadaan').constraintStatus = 'unmet';
    },
    () => ({ type: 'node.edit', id: gate().id, constraintStatus: 'unmet' })
  );
  step(
    pair,
    'shared reason',
    (p) => core.addSharedReason(p, ' Budjetti riittää ', 80, 3),
    ([id]) => ({ type: 'shared.add', id: id!, title: ' Budjetti riittää ', confidence: 80, influence: 3 })
  );
  const shared = () => pair.mine.sharedReasons![0]!;
  step(
    pair,
    'attach to A',
    (p) => core.attachSharedReason(p, p.sharedReasons![0]!.id, byTitle(p, 'A').id, me),
    ([id]) => ({ type: 'shared.attach', id: shared().id, parentId: a().id, nodeId: id! })
  );
  step(
    pair,
    'attach to B',
    (p) => core.attachSharedReason(p, p.sharedReasons![0]!.id, byTitle(p, 'B').id, me),
    ([id]) => ({ type: 'shared.attach', id: shared().id, parentId: b().id, nodeId: id! })
  );
  step(
    pair,
    'update shared values',
    (p) => core.updateSharedReason(p, p.sharedReasons![0]!.id, 'Budjetti riittää hyvin', 60, -2),
    () => ({
      type: 'shared.update',
      id: shared().id,
      title: 'Budjetti riittää hyvin',
      confidence: 60,
      influence: -2,
    })
  );
  step(
    pair,
    'detach from B',
    (p) => core.detachSharedReason(p, p.nodes.filter((n) => n.sharedReasonId).at(-1)!.id),
    () => ({ type: 'shared.detach', nodeId: pair.mine.nodes.filter((n) => n.sharedReasonId).at(-1)!.id })
  );
  step(
    pair,
    'add Bea',
    (p) => {
      p.users.push({ id: core.uid(), name: 'Bea', shares: 1, role: 'editor' });
    },
    ([id]) => ({ type: 'user.add', id: id!, name: 'Bea' })
  );
  const bea = () => pair.mine.users.find((u) => u.name === 'Bea')!;
  step(
    pair,
    'preview ballot',
    (p) => core.upsertBallot(p, byTitle(p, 'A').id, me, 90),
    ([id]) => ({
      type: 'ballot.cast',
      id: id!,
      auditId: 'unused',
      optionId: a().id,
      userId: me,
      preference: 90,
    })
  );
  step(
    pair,
    'open a round',
    (p) => core.startVotingRound(p, { anonymous: false, hideResults: true }),
    (ids) => ({
      type: 'round.start',
      id: ids[0]!,
      auditIds: ids.slice(1),
      anonymous: false,
      hideResults: true,
    })
  );
  step(
    pair,
    'Bea votes',
    (p) => core.upsertBallot(p, byTitle(p, 'B').id, p.users.find((u) => u.name === 'Bea')!.id, 40),
    (ids) => ({
      type: 'ballot.cast',
      id: ids[0]!,
      auditId: ids[1]!,
      optionId: b().id,
      userId: bea().id,
      preference: 40,
    })
  );
  step(
    pair,
    'I update my ballot',
    (p) => core.upsertBallot(p, byTitle(p, 'A').id, me, 95),
    (ids) => ({
      type: 'ballot.cast',
      id: 'unused',
      auditId: ids[0]!,
      optionId: a().id,
      userId: me,
      preference: 95,
    })
  );
  step(
    pair,
    'Bea retracts',
    (p) => core.removeBallot(p, byTitle(p, 'B').id, p.users.find((u) => u.name === 'Bea')!.id),
    (ids) => ({ type: 'ballot.retract', auditId: ids[0]!, optionId: b().id, userId: bea().id })
  );
  step(
    pair,
    'close',
    (p) => core.closeVotingRound(p, me),
    (ids) => ({ type: 'round.close', userId: me, auditId: ids[0]! })
  );
  step(
    pair,
    'second round archives the first',
    (p) => core.startVotingRound(p, { anonymous: true, hideResults: false }),
    (ids) => ({
      type: 'round.start',
      id: ids[0]!,
      auditIds: ids.slice(1),
      anonymous: true,
      hideResults: false,
    })
  );
  assert.equal(pair.mine.voteHistory.length, 1);
  assert.equal(pair.mine.votingRound?.status, 'open');
});

test('refused edits leave the input untouched and name the reason', () => {
  const pair = start('decision');
  const me = pair.actorId;
  step(
    pair,
    'option A',
    (p) => core.addChild(p, root(p).id, 'option', me),
    ([id]) => ({ type: 'node.add', id: id!, parentId: root(pair.mine).id, relation: 'option' })
  );
  step(
    pair,
    'claim under A',
    (p) => core.addChild(p, p.nodes[1]!.id, 'support', me),
    ([id]) => ({ type: 'node.add', id: id!, parentId: pair.mine.nodes[1]!.id, relation: 'support' })
  );
  const before = JSON.stringify(pair.mine);
  const ctx = { ...ACTOR_NOW, actorId: me };
  const refuse = (command: Command, message: RegExp) => {
    assert.throws(() => applyCommand(pair.mine, command, ctx), message);
    assert.equal(JSON.stringify(pair.mine), before);
  };
  refuse({ type: 'node.remove', id: root(pair.mine).id }, /Juurisolmua ei voi poistaa/);
  refuse(
    { type: 'node.move', id: pair.mine.nodes[1]!.id, parentId: pair.mine.nodes[2]!.id },
    /sykli tai väärä/
  );
  refuse(
    { type: 'node.add', id: 'x', parentId: pair.mine.nodes[2]!.id, relation: 'option' },
    /tarvitsee päätöskysymyksen/
  );
  refuse(
    {
      type: 'review.influence',
      id: 'x',
      subjectType: 'primary',
      subjectId: pair.mine.nodes[2]!.id,
      userId: me,
      influence: 1.25,
    },
    /0,1 pisteen/
  );
  refuse(
    { type: 'review.credence', id: 'x', nodeId: pair.mine.nodes[1]!.id, userId: me, credence: 50 },
    /arvo tai reunaehto/
  );
  refuse(
    {
      type: 'ballot.cast',
      id: 'x',
      auditId: 'y',
      optionId: pair.mine.nodes[1]!.id,
      userId: 'nobody',
      preference: 50,
    },
    /Tuntematon käyttäjä/
  );
  refuse({ type: 'round.start', id: 'r', auditIds: ['a'] }, /at least two options/);
  refuse({ type: 'user.remove', id: me }, /Omistajaprofiilia/);
  assert.throws(
    () => applyCommand(pair.mine, { type: 'project.setTitle', title: 'x' }, { now: FIXED, actorId: 'ghost' }),
    /Tuntematon arvioijaprofiili/
  );
  assert.equal(JSON.stringify(pair.mine), before);
});

test('an unchanged document returns the same object (no spurious updatedAt)', () => {
  const pair = start('argument');
  const same = applyCommand(
    pair.mine,
    { type: 'project.setTheme', theme: 'light' },
    { now: '2030-01-01T00:00:00.000Z', actorId: pair.actorId }
  );
  assert.equal(same, pair.mine);
  const changed = applyCommand(
    pair.mine,
    { type: 'project.setTheme', theme: 'dark' },
    { now: '2030-01-01T00:00:00.000Z', actorId: pair.actorId }
  );
  assert.equal(changed.updatedAt, '2030-01-01T00:00:00.000Z');
  assert.equal(parseProject(changed).theme, 'dark');
});
