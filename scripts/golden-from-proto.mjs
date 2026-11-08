// must: every golden fixture under tests/golden/ is produced by the frozen prototype engine (witt-grace-gpt-proto/src/core.js),
//       deterministically (fixed clock, counting ids), for every prototype example and for the hand-built cases below
// test: scripts/golden-from-proto.mjs (run by hand; `npm run golden` rewrites the fixtures, git diff shows drift)
// red-against: a fixture edited by hand; a case built with the new engine instead of the prototype's
// Exit codes: 0 ok · 1 a case failed to build · 2 the prototype engine could not be loaded.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const protoDir = path.join(root, 'witt-grace-gpt-proto');
const outDir = path.join(root, 'tests', 'golden');

// Determinism: the prototype calls crypto.randomUUID() and new Date() internally.
let counter = 0;
const FIXED = '2026-11-08T10:00:00.000Z';
globalThis.crypto.randomUUID = () => `golden-${String(++counter).padStart(4, '0')}`;
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [FIXED]));
  }
  static now() {
    return new RealDate(FIXED).getTime();
  }
};

let core;
try {
  core = createRequire(import.meta.url)(path.join(protoDir, 'src', 'core.js'));
} catch (error) {
  console.error(`golden: cannot load the prototype engine — ${error.message}`);
  process.exit(2);
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const mapToObject = (map, pick) =>
  Object.fromEntries([...map.entries()].map(([k, v]) => [k, pick ? pick(v) : v]));

function nodeResult(r) {
  return {
    score: r.score,
    balance: core.argumentBalance(r.score),
    base: r.base,
    delta: r.delta,
    positive: r.positive,
    negative: r.negative,
    incomplete: Boolean(r.incomplete),
    votesCount: r.votesCount ?? null,
    totalPower: r.totalPower ?? null,
    contributions: (r.contributions || []).map((c) => ({
      id: c.id,
      subjectType: c.subjectType ?? 'primary',
      impact: c.impact ?? null,
      strength: c.strength ?? c.score ?? null,
      magnitude: c.magnitude ?? null,
      missing: Boolean(c.missing),
      ...(c.overlapWarning !== undefined ? { overlapWarning: Boolean(c.overlapWarning) } : {}),
    })),
  };
}

function marginal(project, evaluated) {
  const effects = core.marginalTargetEffects(project, evaluated);
  return mapToObject(effects, (e) => ({
    parentId: e.parentId,
    targetId: e.targetId,
    localDelta: e.localDelta,
    delta: e.delta,
    provisional: e.provisional,
  }));
}

function influenceSummaries(project) {
  const primary = {};
  for (const node of project.nodes) {
    if (node.kind !== 'claim' || !node.parentId || node.sharedReasonId) continue;
    try {
      primary[node.id] = core.influenceSummary(project, 'primary', node.id);
    } catch {
      // not an assessable relation (gate etc.)
    }
  }
  const secondary = {};
  for (const link of project.links || [])
    secondary[link.id] = core.influenceSummary(project, 'secondary', link.id);
  return { primary, secondary };
}

function fixtureFor(name, project, source) {
  const validated = core.validateProject(clone(project));
  const modes = {};
  for (const weighting of ['equal', 'shares', 'structural']) {
    const variant = clone(validated);
    variant.settings.assessmentWeighting = weighting;
    const evaluated = core.evaluate(variant);
    modes[weighting] = {
      nodes: mapToObject(evaluated, nodeResult),
      marginal: marginal(variant, evaluated),
      ranking: variant.mode === 'decision' ? core.decisionRanking(variant).map((r) => r.node.id) : null,
    };
  }
  const assessors = {};
  for (const user of validated.users) {
    const evaluated = core.evaluateAssessor(validated, user.id);
    assessors[user.id] = {
      nodes: mapToObject(evaluated, nodeResult),
      ranking:
        validated.mode === 'decision'
          ? core.decisionRankingForAssessor(validated, user.id, evaluated).map((r) => r.node.id)
          : null,
    };
  }
  const options = {};
  for (const node of validated.nodes) {
    if (node.relation !== 'option') continue;
    options[node.id] = {
      feasibility: core.optionFeasibility(validated, node.id),
      preference: core.optionPreference(validated, node.id),
    };
  }
  const directions = {};
  for (const node of validated.nodes) {
    if (node.kind !== 'claim' || !node.parentId) continue;
    for (const user of validated.users) {
      const own = core.personalInfluence(validated, 'primary', node.id, user.id);
      directions[`${node.id}:${user.id}`] = {
        current: own.current,
        influence: own.current ? own.record.influence : null,
        direction: core.directionFromInfluence(own.current ? own.record.influence : null, node.relation),
      };
    }
  }
  return {
    name,
    source,
    generatedBy: 'witt-grace-gpt-proto/src/core.js (0.11.0-dev.32, evidence-v3-links)',
    project: validated,
    modes,
    assessors,
    options,
    influence: influenceSummaries(validated),
    directions,
  };
}

// ---- hand-built cases (the prototype's own API mutates the document) ----
function human(project, name, shares = 1) {
  const user = { id: core.uid(), name, shares, role: 'editor' };
  project.users.push(user);
  return user;
}
function ai(project, name) {
  const user = { id: core.uid(), name, shares: 0, role: 'viewer', profileKind: 'ai' };
  project.users.push(user);
  return user;
}
function rate(project, nodeId, userId, credence, influence) {
  if (credence !== null) core.upsertVote(project, nodeId, userId, credence);
  if (influence !== null) core.upsertEdgeAssessment(project, 'primary', nodeId, userId, influence);
}

const cases = [];
const add = (name, build) => cases.push({ name, build });

add('g02-neutral-base', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const root = core.rootNode(p);
  const a = core.addChild(p, root.id, 'option', me.id);
  core.addChild(p, a.id, 'support', me.id);
  return p;
});
add('g02-one-support-100-plus5', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const a = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  const s = core.addChild(p, a.id, 'support', me.id);
  rate(p, s.id, me.id, 100, 5);
  return p;
});
add('g02-two-supports-100-plus5', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const a = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  for (let i = 0; i < 2; i++) rate(p, core.addChild(p, a.id, 'support', me.id).id, me.id, 100, 5);
  return p;
});
add('g02-one-oppose-100-minus5', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const a = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  rate(p, core.addChild(p, a.id, 'oppose', me.id).id, me.id, 100, -5);
  return p;
});
add('g02-support-20-plus5', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const a = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  rate(p, core.addChild(p, a.id, 'support', me.id).id, me.id, 20, 5);
  return p;
});
add('g02-grandchild-propagation', () => {
  const p = core.createBlankProject('argument');
  const me = p.users[0];
  const premise = core.addChild(p, core.rootNode(p).id, 'support', me.id);
  const grandchild = core.addChild(p, premise.id, 'support', me.id);
  rate(p, premise.id, me.id, 50, 5);
  rate(p, grandchild.id, me.id, 100, 5);
  return p;
});
add('deep-four-levels-with-sign-reversal', () => {
  const p = core.createBlankProject('argument');
  const me = p.users[0];
  const l1 = core.addChild(p, core.rootNode(p).id, 'support', me.id);
  const l2 = core.addChild(p, l1.id, 'oppose', me.id);
  const l3 = core.addChild(p, l2.id, 'support', me.id);
  const l4 = core.addChild(p, l3.id, 'oppose', me.id);
  rate(p, l1.id, me.id, 80, 4);
  rate(p, l2.id, me.id, 70, -3.5); // created as oppose, rated opposing
  rate(p, l3.id, me.id, 60, 2.5);
  rate(p, l4.id, me.id, 90, -1);
  return p;
});
add('direction-overrides-creation-stance', () => {
  const p = core.createBlankProject('argument');
  const me = p.users[0];
  const created = core.addChild(p, core.rootNode(p).id, 'support', me.id);
  rate(p, created.id, me.id, 100, -3.5); // created as support, rated as opposing
  return p;
});
add('missing-review-is-not-zero', () => {
  const p = core.createBlankProject('argument');
  const me = p.users[0];
  const rated = core.addChild(p, core.rootNode(p).id, 'support', me.id);
  core.addChild(p, core.rootNode(p).id, 'oppose', me.id); // never rated
  rate(p, rated.id, me.id, 100, 5);
  return p;
});
add('stale-review-after-title-change', () => {
  const p = core.createBlankProject('argument');
  const me = p.users[0];
  const claim = core.addChild(p, core.rootNode(p).id, 'support', me.id);
  rate(p, claim.id, me.id, 100, 5);
  claim.title = 'Uudelleen muotoiltu väite'; // fingerprint no longer matches
  return p;
});
add('thesis-with-own-root-vote', () => {
  const p = core.createBlankProject('argument');
  const me = p.users[0];
  const claim = core.addChild(p, core.rootNode(p).id, 'support', me.id);
  rate(p, claim.id, me.id, 100, 5);
  core.upsertVote(p, core.rootNode(p).id, me.id, 20);
  return p;
});
add('equal-vs-shares-weighting', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  me.shares = 5;
  const b = human(p, 'Bea', 1);
  const c = human(p, 'Cem', 1);
  const d = human(p, 'Dee', 1);
  const option = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  const claim = core.addChild(p, option.id, 'support', me.id);
  rate(p, claim.id, me.id, 100, 5);
  rate(p, claim.id, b.id, 40, -2);
  rate(p, claim.id, c.id, 60, 1);
  rate(p, claim.id, d.id, 80, 3);
  return p;
});
add('zero-share-user-and-ai-excluded', () => {
  const p = core.createBlankProject('argument');
  const me = p.users[0];
  const zero = human(p, 'Nolla', 0);
  const bot = ai(p, 'Malli');
  const claim = core.addChild(p, core.rootNode(p).id, 'support', me.id);
  rate(p, claim.id, me.id, 100, 5);
  rate(p, claim.id, zero.id, 0, -5);
  rate(p, claim.id, bot.id, 10, -5);
  return p;
});
add('structural-preview-uses-authored-values', () => {
  const p = core.createBlankProject('decision');
  p.settings.assessmentWeighting = 'structural';
  const me = p.users[0];
  const option = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  const s = core.addChild(p, option.id, 'support', me.id);
  s.confidence = 60;
  s.impact = 4;
  const o = core.addChild(p, option.id, 'oppose', me.id);
  o.confidence = 90;
  o.impact = 2;
  return p;
});
add('gates-and-values', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const root = core.rootNode(p);
  const blocked = core.addChild(p, root.id, 'option', me.id);
  const unresolved = core.addChild(p, root.id, 'option', me.id);
  const feasible = core.addChild(p, root.id, 'option', me.id);
  const gate = core.addChild(p, blocked.id, 'support', me.id);
  gate.semanticType = 'constraint';
  gate.constraintStatus = 'unmet';
  const unknownGate = core.addChild(p, unresolved.id, 'support', me.id);
  unknownGate.semanticType = 'prerequisite';
  const value = core.addChild(p, feasible.id, 'support', me.id);
  value.semanticType = 'value';
  core.upsertEdgeAssessment(p, 'primary', value.id, me.id, 4);
  const fact = core.addChild(p, feasible.id, 'support', me.id);
  rate(p, fact.id, me.id, 100, 5);
  rate(p, core.addChild(p, blocked.id, 'support', me.id).id, me.id, 100, 5);
  return p;
});
add('option-groups-are-structural', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const group = core.addChild(p, core.rootNode(p).id, 'group', me.id);
  const a = core.addChild(p, group.id, 'option', me.id);
  const b = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  rate(p, core.addChild(p, a.id, 'support', me.id).id, me.id, 100, 5);
  rate(p, core.addChild(p, b.id, 'support', me.id).id, me.id, 50, 5);
  return p;
});
add('reason-concept-two-contexts', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const a = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  const b = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  const first = core.addChild(p, a.id, 'support', me.id);
  first.title = 'Saamme perheen yhteistä aikaa';
  const second = core.reuseClaimAt(p, first.id, b.id, me.id);
  rate(p, first.id, me.id, 70, 4);
  rate(p, second.id, me.id, 90, -3);
  return p;
});
add('locked-shared-reason', () => {
  const p = core.createBlankProject('decision');
  const me = p.users[0];
  const a = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  const b = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  const reason = core.addSharedReason(p, 'Budjetti riittää', 80, 3);
  core.attachSharedReason(p, reason.id, a.id, me.id);
  core.attachSharedReason(p, reason.id, b.id, me.id);
  rate(p, core.addChild(p, b.id, 'oppose', me.id).id, me.id, 100, -2);
  return p;
});
add('secondary-link-and-overlap-note', () => {
  const p = core.createBlankProject('argument');
  const me = p.users[0];
  const root = core.rootNode(p);
  const left = core.addChild(p, root.id, 'support', me.id);
  const right = core.addChild(p, root.id, 'support', me.id);
  const deep = core.addChild(p, left.id, 'support', me.id);
  rate(p, left.id, me.id, 80, 3);
  rate(p, right.id, me.id, 60, 2);
  rate(p, deep.id, me.id, 100, 4);
  const link = core.addSignedLink(p, deep.id, right.id, 2.5);
  core.upsertEdgeAssessment(p, 'secondary', link.id, me.id, 2.5);
  return p;
});
add('ballot-round-with-shares', () => {
  const p = core.createBlankProject('decision');
  p.settings.voteWeighting = 'shares';
  const me = p.users[0];
  me.shares = 3;
  const b = human(p, 'Bea', 1);
  const bot = ai(p, 'Malli');
  const a = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  const c = core.addChild(p, core.rootNode(p).id, 'option', me.id);
  core.upsertBallot(p, a.id, me.id, 90);
  core.upsertBallot(p, a.id, b.id, 10);
  core.upsertBallot(p, c.id, b.id, 100);
  core.startVotingRound(p, { anonymous: false, hideResults: true });
  core.upsertBallot(p, c.id, me.id, 20);
  core.closeVotingRound(p, me.id);
  // a second round after the first is archived
  core.startVotingRound(p, { anonymous: true, hideResults: false });
  core.upsertBallot(p, a.id, b.id, 55);
  void bot;
  return p;
});

// ---- run ----
mkdirSync(outDir, { recursive: true });
const written = [];
let failed = 0;
for (const file of readdirSync(path.join(protoDir, 'examples')).sort()) {
  if (!file.endsWith('.witt.json')) continue;
  const raw = JSON.parse(readFileSync(path.join(protoDir, 'examples', file), 'utf8'));
  if (raw.schemaVersion !== 8) {
    console.log(`golden: skip ${file} (schemaVersion ${raw.schemaVersion ?? 'none'})`);
    continue;
  }
  try {
    const fixture = fixtureFor(
      `example-${file.replace('.witt.json', '')}`,
      raw,
      `witt-grace-gpt-proto/examples/${file}`
    );
    const out = path.join(outDir, `${fixture.name}.json`);
    writeFileSync(out, JSON.stringify(fixture, null, 1) + '\n');
    written.push(fixture.name);
  } catch (error) {
    failed++;
    console.error(`golden: ${file} failed — ${error.message}`);
  }
}
for (const { name, build } of cases) {
  counter = 0;
  try {
    const fixture = fixtureFor(name, build(), 'scripts/golden-from-proto.mjs');
    writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(fixture, null, 1) + '\n');
    written.push(name);
  } catch (error) {
    failed++;
    console.error(`golden: case ${name} failed — ${error.message}`);
  }
}
console.log(`golden: wrote ${written.length} fixtures to tests/golden/${failed ? `, ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
