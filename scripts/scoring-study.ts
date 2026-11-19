// A reproducible study of the calculation methods on random trees (owner request 2026-11-18; the first, exploratory
// round of the same day was run in scratch files that were not kept). It uses the real engine, a fixed seed and one
// assessor, and prints one table per kind of tree. docs/SCORING_STUDY.md quotes its output.
// Run: node scripts/scoring-study.ts            (4 500 trees, about a minute)
//      node scripts/scoring-study.ts 300        (trees per kind, for a quick look)
import { applyCommand, createBlankProject, evaluate, SCORING_VERSIONS } from '../src/domain/index.ts';
import type { Command, Project, ScoringVersion } from '../src/domain/index.ts';

const NOW = '2026-11-18T12:00:00.000Z';
const USER = 'u1';
const EPS = 1e-9;

/** mulberry32: a small seeded generator, so every run draws the same trees. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kind = 'all rated' | 'inner claims unrated' | 'mixed';
const KINDS: Kind[] = ['all rated', 'inner claims unrated', 'mixed'];

interface Leaf {
  id: string;
  /** +1 when a stronger leaf should raise the thesis, −1 when it should lower it (the product of the signs above). */
  direction: number;
  depth: number;
}
interface Tree {
  project: Project;
  leaves: Leaf[];
}

let serial = 0;
const run = (p: Project, ...commands: Command[]): Project =>
  commands.reduce((acc, c) => applyCommand(acc, c, { now: NOW, actorId: USER }), p);
function rated(p: Project, nodeId: string, credence: number | null, influence: number): Project {
  if (credence !== null)
    p = run(p, { type: 'review.credence', id: `v${++serial}`, nodeId, userId: USER, credence });
  return run(p, {
    type: 'review.influence',
    id: `a${++serial}`,
    subjectType: 'primary',
    subjectId: nodeId,
    userId: USER,
    influence,
  });
}
function reason(
  p: Project,
  id: string,
  parentId: string,
  credence: number | null,
  influence: number
): Project {
  p = run(p, { type: 'node.add', id, parentId, relation: influence < 0 ? 'oppose' : 'support', title: id });
  return rated(p, id, credence, influence);
}

/** A thesis with reasons three or four levels deep; every leaf is rated, inner claims by `kind`. */
function randomTree(random: () => number, kind: Kind): Tree {
  let project = createBlankProject({ projectId: 'study', rootId: 'T', userId: USER, now: NOW });
  const leaves: Leaf[] = [];
  const depth = random() < 0.5 ? 3 : 4;
  let count = 0;
  const grow = (parentId: string, level: number, direction: number): void => {
    const children = level === 1 ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2);
    for (let i = 0; i < children; i++) {
      const id = `n${++count}`;
      const influence = (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 9)) * 0.5;
      const leaf = level === depth;
      const isRated = leaf || kind === 'all rated' || (kind === 'mixed' && random() < 0.5);
      const credence = isRated ? 5 * (2 + Math.floor(random() * 19)) : null;
      project = reason(project, id, parentId, credence, influence);
      const next = direction * Math.sign(influence);
      if (leaf) leaves.push({ id, direction: next, depth: level });
      else grow(id, level + 1, next);
    }
  };
  grow('T', 1, 1);
  return { project, leaves };
}

const under = (p: Project, scoring: ScoringVersion): Project => ({
  ...p,
  settings: { ...p.settings, scoring },
});
/** The thesis' balance −100…+100, or null when it has no result. */
function thesis(p: Project, scoring: ScoringVersion): number | null {
  const score = evaluate(under(p, scoring)).get('T')?.score;
  return score === null || score === undefined ? null : 2 * score - 100;
}

interface Tally {
  results: number;
  supportCases: number;
  supportWrong: number;
  zeroCases: number;
  zeroChanged: number;
  reachCases: number;
  reachSum: number;
  nudgeMax: number;
}
const emptyTally = (): Tally => ({
  results: 0,
  supportCases: 0,
  supportWrong: 0,
  zeroCases: 0,
  zeroChanged: 0,
  reachCases: 0,
  reachSum: 0,
  nudgeMax: 0,
});

function study(kind: Kind, trees: number, random: () => number): Map<ScoringVersion, Tally> {
  const tallies = new Map<ScoringVersion, Tally>(SCORING_VERSIONS.map((v) => [v, emptyTally()]));
  for (let i = 0; i < trees; i++) {
    const { project, leaves } = randomTree(random, kind);
    const leaf = leaves[Math.floor(random() * leaves.length)]!;
    const deepest = leaves.reduce((a, b) => (b.depth > a.depth ? b : a));
    // 1. A fully credible supporting reason is added under a rated leaf: the leaf should not get weaker.
    const supported = reason(project, 'added', leaf.id, 100, 3);
    // 2. A reason nobody believes (0 %) is added under the same leaf: nothing should move.
    const zero = reason(project, 'added', leaf.id, 0, 5);
    // 3. The deepest leaf goes from 0 % to 100 %: how far does that reach the thesis?
    const low = run(project, {
      type: 'review.credence',
      id: 'low',
      nodeId: deepest.id,
      userId: USER,
      credence: 0,
    });
    const high = run(project, {
      type: 'review.credence',
      id: 'high',
      nodeId: deepest.id,
      userId: USER,
      credence: 100,
    });
    // 4. One leaf's credence moves by one point: the largest move of the thesis is the noise the method lets through.
    const current = project.votes.find((v) => v.nodeId === leaf.id)!.confidence;
    const nudged = run(project, {
      type: 'review.credence',
      id: 'nudge',
      nodeId: leaf.id,
      userId: USER,
      credence: current >= 100 ? current - 1 : current + 1,
    });
    for (const [scoring, tally] of tallies) {
      const before = thesis(project, scoring);
      if (before === null) continue;
      tally.results++;
      const afterSupport = thesis(supported, scoring);
      if (afterSupport !== null) {
        tally.supportCases++;
        if ((afterSupport - before) * leaf.direction < -EPS) tally.supportWrong++;
      }
      const afterZero = thesis(zero, scoring);
      if (afterZero !== null) {
        tally.zeroCases++;
        if (Math.abs(afterZero - before) > EPS) tally.zeroChanged++;
      }
      const a = thesis(low, scoring);
      const b = thesis(high, scoring);
      if (a !== null && b !== null) {
        tally.reachCases++;
        tally.reachSum += Math.abs(b - a);
      }
      const afterNudge = thesis(nudged, scoring);
      if (afterNudge !== null) tally.nudgeMax = Math.max(tally.nudgeMax, Math.abs(afterNudge - before));
    }
  }
  return tallies;
}

const percent = (part: number, whole: number): string =>
  whole ? `${((100 * part) / whole).toFixed(1)} %` : '—';

const perKind = Number(process.argv[2] ?? 1500);
const random = generator(20261118);
console.log(`scoring-study: ${perKind} trees per kind, seed 20261118, one assessor, thesis as the target\n`);
for (const kind of KINDS) {
  const tallies = study(kind, perKind, random);
  console.log(`## ${kind}`);
  console.log(
    '| Method | Trees with a result | Support under a rated leaf moves the thesis the wrong way | A 0 % reason changes the thesis | Deepest leaf 0 % → 100 %, mean move of the thesis | One point on a leaf, largest move |'
  );
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const [scoring, t] of tallies)
    console.log(
      `| \`${scoring}\` | ${t.results} | ${percent(t.supportWrong, t.supportCases)} | ${percent(t.zeroChanged, t.zeroCases)} | ${
        t.reachCases ? (t.reachSum / t.reachCases).toFixed(2) : '—'
      } | ${t.nudgeMax.toFixed(2)} |`
    );
  console.log('');
}
