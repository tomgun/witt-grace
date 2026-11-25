/**
 * must: a risk tree is a third document type, `risk` (WG-058, owner 2026-11-24/25: “Riskit”, the root a goal, a
 *       supporting action kept as its own kind as it supports the goal and does not hold back a risk): the roles
 *       are read from the tree and never stored; the root is the goal; under the goal a supporting reason is a
 *       supporting action and an opposing one a risk; under a risk or a cause a supporting reason is a cause and an
 *       opposing one a mitigation; under an action or a mitigation an opposing reason is a risk (that it fails) and a
 *       supporting one a plain reason with no role, as is everything under it; a neutral note has no role; the role
 *       follows the direction people have turned a reason to; outside a risk tree nothing has a role; the risk tree
 *       scores exactly as the same tree as an argument; a new risk tree asks for its goal; the type survives the file
 *       and the session's new-diagram message; the example is what scripts/build-risk-example.ts builds, a risk tree
 *       whose every node has its role
 * test: tests/unit/risk-tree.test.ts
 * red-against: a mitigation tagged as a risk because it opposes (the sign read without the parent's side), a reason
 *              for an action tagged as another action, a role read from the authored relation after people turned it,
 *              roles shown in an argument, a risk tree scored differently from the same argument (a role leaking
 *              into the numbers), the type lost on save, a participant's request for a risk diagram refused
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyCommand,
  childRiskRole,
  createBlankProject,
  evaluate,
  parseProject,
  riskRole,
  serializeProjectFile,
} from '../../src/domain/index.ts';
import type { Command, Mode, Project, Stance } from '../../src/domain/index.ts';
import { parseToHost } from '../../src/domain/session.ts';

const NOW = '2026-11-25T10:00:00.000Z';
const ctx = { now: NOW, actorId: 'u1' };
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const add = (id: string, parentId: string, relation: 'support' | 'oppose' | 'neutral'): Command => ({
  type: 'node.add',
  id,
  parentId,
  relation,
  title: id,
});
function tree(mode: Mode): Project {
  return run(
    createBlankProject({ mode, projectId: 'p', rootId: 'goal', userId: 'u1', now: NOW }),
    add('action', 'goal', 'support'),
    add('action-why', 'action', 'support'),
    add('action-why-more', 'action-why', 'oppose'),
    add('action-fails', 'action', 'oppose'),
    add('risk', 'goal', 'oppose'),
    add('cause', 'risk', 'support'),
    add('cause-of-cause', 'cause', 'support'),
    add('cause-held', 'cause', 'oppose'),
    add('mitigation', 'risk', 'oppose'),
    add('mitigation-fails', 'mitigation', 'oppose'),
    add('mitigation-works', 'mitigation', 'support'),
    add('note', 'risk', 'neutral'),
    { type: 'review.credence', id: 'v1', nodeId: 'risk', userId: 'u1', credence: 40 },
    {
      type: 'review.influence',
      id: 'a1',
      subjectType: 'primary',
      subjectId: 'risk',
      userId: 'u1',
      influence: -4,
    },
    { type: 'review.credence', id: 'v2', nodeId: 'mitigation', userId: 'u1', credence: 70 },
    {
      type: 'review.influence',
      id: 'a2',
      subjectType: 'primary',
      subjectId: 'mitigation',
      userId: 'u1',
      influence: -3,
    }
  );
}
const roleOf = (p: Project, id: string, direction?: (n: Project['nodes'][number]) => Stance) =>
  riskRole(
    p,
    p.nodes.find((n) => n.id === id)!,
    direction
  );

test('the roles are read from where a node stands', () => {
  const p = tree('risk');
  const roles = Object.fromEntries(p.nodes.map((n) => [n.id, riskRole(p, n)]));
  assert.deepEqual(roles, {
    goal: 'goal',
    action: 'action',
    'action-why': null,
    'action-why-more': null,
    'action-fails': 'risk',
    risk: 'risk',
    cause: 'cause',
    'cause-of-cause': 'cause',
    'cause-held': 'mitigation',
    mitigation: 'mitigation',
    'mitigation-fails': 'risk',
    'mitigation-works': null,
    note: null,
  });
  assert.equal(childRiskRole('goal', 'support'), 'action');
  assert.equal(childRiskRole('risk', 'oppose'), 'mitigation');
  assert.equal(childRiskRole('mitigation', 'support'), null);
  assert.equal(childRiskRole('goal', 'neutral'), null);
});

test('the role follows the direction a reason is read in; outside a risk tree nothing has a role', () => {
  const p = tree('risk');
  // People turned the mitigation into something that adds to the risk: it reads as a cause, and the risk of it
  // failing as a mitigation.
  const turned = (n: Project['nodes'][number]): Stance => (n.id === 'mitigation' ? 'support' : n.relation);
  assert.equal(roleOf(p, 'mitigation', turned), 'cause');
  assert.equal(roleOf(p, 'mitigation-fails', turned), 'mitigation');
  const argument = tree('argument');
  assert.ok(argument.nodes.every((n) => riskRole(argument, n) === null));
  const decision = tree('argument');
  assert.ok(decision.nodes.every((n) => riskRole({ ...decision, mode: 'decision' }, n) === null));
});

test('a risk tree scores exactly as the same tree as an argument', () => {
  const asRisk = tree('risk');
  const asArgument = tree('argument');
  const risk = evaluate(asRisk);
  assert.deepEqual(risk, evaluate(asArgument));
  // The goal is read like a main claim: it has a balance.
  assert.equal(typeof risk.get('goal')?.score, 'number');
});

test('a new risk tree asks for its goal; the type survives the file, a switch and the session message', () => {
  const blank = createBlankProject({ mode: 'risk', projectId: 'p', rootId: 'r', userId: 'u1', now: NOW });
  assert.equal(blank.nodes[0]!.title, 'Mikä on tavoite?');
  assert.equal(blank.nodes[0]!.kind, 'claim');
  const p = tree('risk');
  assert.equal(parseProject(JSON.parse(serializeProjectFile(p))).mode, 'risk');
  const switched = run(tree('argument'), { type: 'project.setMode', mode: 'risk' });
  assert.equal(switched.mode, 'risk');
  assert.equal(roleOf(switched, 'mitigation'), 'mitigation');
  const ask = { t: 'diagram', id: 'pr-1', doc: 'd', root: 'r', mode: 'risk' };
  assert.deepEqual(parseToHost(JSON.stringify(ask)), { ok: true, message: ask });
});

test('the example is the generator output, a risk tree whose every node has its role', () => {
  const file = new URL('../../public/examples/riskit-verkkokauppa.witt.json', import.meta.url);
  const before = readFileSync(file, 'utf8');
  execFileSync(process.execPath, ['scripts/build-risk-example.ts']);
  assert.equal(readFileSync(file, 'utf8'), before);
  const p = parseProject(
    JSON.parse(
      readFileSync(new URL('../../public/examples/riskit-verkkokauppa.witt.json', import.meta.url), 'utf8')
    )
  );
  assert.equal(p.mode, 'risk');
  const count = (role: string) => p.nodes.filter((n) => riskRole(p, n) === role).length;
  assert.deepEqual(['goal', 'action', 'risk', 'cause', 'mitigation'].map(count), [1, 1, 4, 2, 4]);
  assert.equal(p.nodes.length, 12);
});
