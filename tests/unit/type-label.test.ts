/**
 * must: `node.add` with `semanticType: 'value'` makes a value judgment in one step; `node.edit` sets and clears a
 *       node's own type name (trimmed, at most 40 characters); a new option, group or value takes the name its
 *       siblings of the same kind use, a plain reason does not; the name survives `parseProject`; it changes no score
 *       (owner decisions 2026-11-09, UI_INVENTORY S-15)
 * test: tests/unit/type-label.test.ts
 * red-against: a value added as a fact, the name copied onto a supporting reason, a 41-character name accepted, the
 *              field dropped on load, a renamed option scoring differently
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, createBlankProject, evaluate, parseProject } from '../../src/domain/index.ts';
import type { Command, Project } from '../../src/domain/index.ts';

const ctx = { now: '2026-11-09T10:00:00.000Z', actorId: 'u1' };
const run = (p: Project, ...commands: Command[]) => commands.reduce((acc, c) => applyCommand(acc, c, ctx), p);
const decision = () =>
  createBlankProject({ mode: 'decision', projectId: 'p', rootId: 'D', userId: 'u1', now: ctx.now });
const byId = (p: Project, id: string) => p.nodes.find((n) => n.id === id)!;

test('a value judgment is added in one step', () => {
  const p = run(
    decision(),
    { type: 'node.add', id: 'O', parentId: 'D', relation: 'option' },
    { type: 'node.add', id: 'V', parentId: 'O', relation: 'support', semanticType: 'value' }
  );
  assert.equal(byId(p, 'V').semanticType, 'value');
  assert.throws(() =>
    run(p, { type: 'node.add', id: 'X', parentId: 'D', relation: 'option', semanticType: 'value' })
  );
});

test('the own type name is set, trimmed, limited, cleared and inherited by siblings of the same kind', () => {
  let p = run(
    decision(),
    { type: 'node.add', id: 'O1', parentId: 'D', relation: 'option' },
    { type: 'node.edit', id: 'O1', typeLabel: '  Kriteeri ' },
    { type: 'node.edit', id: 'D', typeLabel: 'Rekrytointi' }
  );
  assert.equal(byId(p, 'O1').typeLabel, 'Kriteeri');
  p = run(
    p,
    { type: 'node.add', id: 'O2', parentId: 'D', relation: 'option' },
    { type: 'node.add', id: 'V1', parentId: 'O1', relation: 'support', semanticType: 'value' },
    { type: 'node.edit', id: 'V1', typeLabel: 'Tavoite' },
    { type: 'node.add', id: 'V2', parentId: 'O1', relation: 'support', semanticType: 'value' },
    { type: 'node.add', id: 'R1', parentId: 'O1', relation: 'support' }
  );
  assert.equal(byId(p, 'O2').typeLabel, 'Kriteeri');
  assert.equal(byId(p, 'V2').typeLabel, 'Tavoite');
  assert.equal(byId(p, 'R1').typeLabel, undefined);
  assert.throws(() => run(p, { type: 'node.edit', id: 'O1', typeLabel: 'x'.repeat(41) }));
  const reloaded = parseProject(JSON.parse(JSON.stringify(p)));
  assert.equal(byId(reloaded, 'D').typeLabel, 'Rekrytointi');
  assert.equal(byId(reloaded, 'V2').typeLabel, 'Tavoite');
  const cleared = run(p, { type: 'node.edit', id: 'O1', typeLabel: null });
  assert.equal('typeLabel' in byId(cleared, 'O1'), false);
  assert.deepEqual([...evaluate(cleared).entries()], [...evaluate(p).entries()]);
});
