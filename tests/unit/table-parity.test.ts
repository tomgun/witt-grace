// must: the domain's table projection produces exactly what the frozen prototype's `src/table-model.js` produces:
//       the same rows in the same order (depth, parent, grandparent, ancestors, path, anchor, chain direction,
//       collapsed marker) for every prototype example, every relation filter the prototype accepts (and the ones
//       it ignores), every search the examples can hit (titles, details, ancestor context, case and NFKC folding),
//       and the same assessment details (reviews, stale flags, secondary links, comments) for every node
//       (UX-06, inv-review-vote-table §F.4, §F.6)
// test: tests/unit/table-parity.test.ts (requires the prototype module directly; it is CommonJS/UMD)
// red-against: a filtered-out node's children dropped with it, the chain polarity reset at an oppose instead of
//              flipped, a decision root used as a chain anchor, the search folded differently from NFKC+lowercase,
//              the ancestor context left out of the search, a stale review presented as current, a group's
//              primary review listed
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assessmentDetails, projectRows } from '../../src/domain/table.ts';
import type { Project } from '../../src/domain/model.ts';

const require = createRequire(import.meta.url);
const protoDir = path.join(process.cwd(), 'witt-grace-gpt-proto');
const ProtoTable = require(path.join(protoDir, 'src', 'table-model.js')) as {
  projectRows: (project: unknown, filters?: unknown) => unknown[];
  assessmentDetails: (project: unknown, nodeId: string) => unknown;
};

const examples = readdirSync(path.join(protoDir, 'examples'))
  .filter((f) => f.endsWith('.witt.json') && !f.startsWith('ai-draft'))
  .map((f) => ({
    name: f,
    project: JSON.parse(readFileSync(path.join(protoDir, 'examples', f), 'utf8')) as Project,
  }));
assert.ok(examples.length >= 10, 'the prototype examples are present');

/** The prototype accepts four stances; anything else (including the app's old `neutral`) reads as `all`. */
const stances = ['all', 'support', 'oppose', 'option', 'neutral', 'group', 'root', '', undefined, null];

/** Searches every example can hit: whole titles, title fragments in odd case, details fragments, an ancestor's
 * title (context match), compatibility forms (NFKC: ﬁ → fi, ① → 1), whitespace padding and a miss. */
function queriesFor(project: Project): (string | undefined | null)[] {
  const out = new Set<string | undefined | null>(['', '   ', undefined, null, 'ei-osumaa-xyz', 'Ä', 'ä']);
  for (const node of project.nodes) {
    out.add(node.title);
    out.add(node.title.toUpperCase());
    const words = node.title.split(/\s+/).filter(Boolean);
    if (words[0]) out.add(` ${words[0]} `);
    if (words.length > 2) out.add(words.slice(1, 3).join(' ').toLocaleUpperCase());
    if (node.details) out.add(node.details.slice(0, 12));
  }
  out.add('ﬁ');
  out.add('①');
  return [...out];
}

const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));

test('projectRows matches the prototype for every example, filter and search', () => {
  let combinations = 0;
  for (const { name, project } of examples) {
    for (const stance of stances)
      for (const query of queriesFor(project)) {
        const filters = { stance, query };
        const ours = projectRows(project, filters);
        const theirs = ProtoTable.projectRows(project, filters);
        assert.deepEqual(
          asJson(ours),
          asJson(theirs),
          `${name} stance=${String(stance)} query=${String(query)}`
        );
        combinations++;
      }
    // The default filter set and a nonsense filter object behave like `all`.
    assert.deepEqual(asJson(projectRows(project)), asJson(ProtoTable.projectRows(project)));
    assert.deepEqual(
      asJson(projectRows(project, { stance: 'bogus' })),
      asJson(ProtoTable.projectRows(project, { stance: 'bogus' }))
    );
  }
  assert.ok(combinations > 1000, `exercised ${combinations} filter/search combinations`);
});

test('every node is a row when unfiltered, in prototype order, and the chain anchors agree', () => {
  for (const { name, project } of examples) {
    const rows = projectRows(project);
    const reachable = rows.map((r) => r.id);
    assert.equal(reachable.length, new Set(reachable).size, `${name}: no duplicates`);
    const theirs = ProtoTable.projectRows(project) as {
      id: string;
      anchorId: string | null;
      chainDirection: number;
    }[];
    assert.deepEqual(
      reachable,
      theirs.map((r) => r.id),
      `${name}: order`
    );
    assert.deepEqual(
      rows.map((r) => [r.anchorId, r.chainDirection]),
      theirs.map((r) => [r.anchorId, r.chainDirection]),
      `${name}: anchors and polarity`
    );
  }
});

test('assessmentDetails matches the prototype for every node of every example', () => {
  let nodes = 0;
  for (const { name, project } of examples) {
    for (const node of project.nodes) {
      assert.deepEqual(
        asJson(assessmentDetails(project, node.id)),
        asJson(ProtoTable.assessmentDetails(project, node.id)),
        `${name} ${node.id}`
      );
      nodes++;
    }
    assert.equal(assessmentDetails(project, 'missing-node'), null);
    assert.equal(ProtoTable.assessmentDetails(project, 'missing-node'), null);
  }
  assert.ok(nodes > 100, `checked ${nodes} nodes`);
});

test('a stale primary review is flagged exactly as the prototype flags it after a title edit', () => {
  const source = examples.find((e) => e.name === 'debate-kaupunkiliikenne.witt.json')!;
  const project = asJson(source.project) as Project;
  const reviewed = project.nodes.find((n) =>
    (project.edgeAssessments ?? []).some((a) => a.subjectType === 'primary' && a.subjectId === n.id)
  )!;
  const before = assessmentDetails(project, reviewed.id)!;
  assert.ok(before.impactReviews.length > 0 && before.impactReviews.every((r) => !r.stale));
  reviewed.title = `${reviewed.title} (muokattu)`;
  const after = assessmentDetails(project, reviewed.id)!;
  assert.ok(after.impactReviews.every((r) => r.stale));
  assert.deepEqual(asJson(after), asJson(ProtoTable.assessmentDetails(project, reviewed.id)));
});
