/**
 * must: the `witt-contribution-v2` and `witt-contribution-bundle-v1` ports reproduce the prototype's
 *       `src/contributions.js` — the fingerprint, the schemas and example, the request and task text byte for byte,
 *       every accepted proposal's normalized shape and every refusal message, the merged document for every
 *       acceptance choice (same ids, same clock), the exported diff and bundle of chosen people's changes, and the
 *       bundle merge that maps each person to their own profile; a stale or foreign proposal is never merged
 * test: tests/unit/ai-contribution.test.ts (the prototype module is the oracle)
 * red-against: a fingerprint over the raw instead of the validated document, ratings imported with "Tuo arvioinnit"
 *              off (directly or through a locked shared reason), an AI proposal merged into a human profile or a human
 *              nickname labelled AI, a deselected claim's dependants counted as imported, an edit attributed to the
 *              importer instead of the proposal's author, an untracked edit exported under a chosen user's name
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRIBUTION_BUNDLE_FORMAT,
  CONTRIBUTION_BUNDLE_SCHEMA,
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_EXAMPLE,
  CONTRIBUTION_FORMAT,
  CONTRIBUTION_REQUEST_FORMAT,
  CONTRIBUTION_SCHEMA,
  applyContribution,
  buildContributionPrompt,
  buildContributionRequest,
  createBlankProject,
  diffContribution,
  exportContribution,
  parseContributionBundle,
  previewContribution,
  projectFingerprint,
} from '../../src/domain/index.ts';
import type { BundleMergeResult, ContributionChoices, MergeResult, Project } from '../../src/domain/index.ts';
import { FIXED, clock, clone, exampleProjects, proto, sameError, withOracle } from './ai-oracle.ts';

const X = proto.contributions;
const core = proto.core;
type Raw = Record<string, unknown>;

/** The prototype test's fixture: a decision with one option and one supporting claim, owned by "Minä". */
function base(): Project {
  return withOracle(() => {
    const p = core.createBlankProject('decision');
    p.title = 'Saturday';
    p.nodes[0].title = 'Plans';
    const a = core.addChild(p, p.nodes[0].id, 'option', p.users[0].id);
    a.title = 'Pool';
    const b = core.addChild(p, a.id, 'support', p.users[0].id);
    b.title = 'Family time';
    return core.validateProject(p) as Project;
  }, 'base');
}
function patch(p: Project): Raw {
  return {
    format: CONTRIBUTION_FORMAT,
    projectId: p.id,
    baseFingerprint: projectFingerprint(p),
    author: { kind: 'ai', name: 'Model' },
    claims: [{ tempId: 'fresh', parentId: p.nodes[1]!.id, relation: 'oppose', title: 'Crowded' }],
    edits: [{ nodeId: p.nodes[2]!.id, title: 'Quality time' }],
    assessments: [{ nodeId: 'fresh', credence: 85, primaryInfluence: -3 }],
    comments: [{ nodeId: 'fresh', body: 'Depends on weather' }],
  };
}
/** A richer proposal: links, relation assessments, shared reasons, gates, a comment on an existing node. */
function richPatch(p: Project): Raw {
  const [root, option, claim] = p.nodes as [Project['nodes'][0], Project['nodes'][0], Project['nodes'][0]];
  return {
    ...patch(p),
    claims: [
      { tempId: 'fresh', parentId: option.id, relation: 'oppose', title: 'Crowded', details: 'On Saturdays' },
      {
        tempId: 'gate',
        parentId: 'fresh',
        relation: 'support',
        title: 'Pool is open',
        semanticType: 'prerequisite',
        constraintStatus: 'unknown',
      },
      {
        tempId: 'alt',
        parentId: root.id,
        relation: 'option',
        title: 'Stay home',
        authorVisibility: 'anonymous',
      },
      {
        tempId: 'deep',
        parentId: 'alt',
        relation: 'neutral',
        title: 'Weather unknown',
        semanticType: 'assumption',
      },
    ],
    edits: [
      { nodeId: claim.id, title: 'Quality time', details: 'Together' },
      { nodeId: 'fresh', semanticType: 'fact' },
    ],
    links: [{ sourceId: 'deep', targetId: option.id, relation: 'oppose', influence: -2.5 }],
    sharedReasons: [{ tempId: 'common1', title: 'Travel costs money', credence: 88, influence: -1.5 }],
    sharedAttachments: [
      { reasonId: 'common1', parentId: option.id },
      { reasonId: 'common1', parentId: 'alt' },
    ],
    assessments: [
      { nodeId: 'fresh', credence: 85, primaryInfluence: -3 },
      { nodeId: claim.id, credence: 60 },
      { nodeId: 'deep', credence: 40, primaryInfluence: 0 },
    ],
    relationAssessments: [{ subjectType: 'primary', subjectId: claim.id, influence: 4.5 }],
    comments: [
      { nodeId: 'fresh', body: 'Depends on weather' },
      { nodeId: claim.id, body: 'Agreed' },
    ],
  };
}
const protoChoices = (c: ContributionChoices) =>
  Object.fromEntries(CONTRIBUTION_CATEGORIES.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
const protoSource = (c: ContributionChoices) => (c.source ? { ...c.source } : null);
const protoFiltered = (raw: Raw, c: ContributionChoices): Raw => ({
  ...raw,
  ...(c.selectedClaims && raw.claims
    ? { claims: (raw.claims as unknown[]).filter((_, i) => c.selectedClaims!.includes(i)) }
    : {}),
  ...(c.selectedEdits && raw.edits
    ? { edits: (raw.edits as unknown[]).filter((_, i) => c.selectedEdits!.includes(i)) }
    : {}),
});
const stripKind = <T extends { kind: string }>(r: T): Omit<T, 'kind'> => {
  const { kind, ...rest } = r;
  void kind;
  return rest;
};
/** Narrow a merge result to the single-proposal shape (the test fails loudly otherwise). */
function single(result: MergeResult | BundleMergeResult): MergeResult {
  assert.equal(result.kind, 'single');
  if (result.kind !== 'single') throw new Error('bundle result where a single result was expected');
  return result;
}

test('constants, schemas and the response example equal the prototype objects, key order included', () => {
  assert.equal(CONTRIBUTION_FORMAT, X.FORMAT);
  assert.equal(CONTRIBUTION_BUNDLE_FORMAT, X.GROUP_FORMAT);
  assert.equal(CONTRIBUTION_REQUEST_FORMAT, X.REQUEST_FORMAT);
  assert.deepEqual([...CONTRIBUTION_CATEGORIES], X.categories);
  assert.equal(JSON.stringify(CONTRIBUTION_SCHEMA, null, 2), JSON.stringify(X.schema, null, 2));
  assert.equal(JSON.stringify(CONTRIBUTION_BUNDLE_SCHEMA, null, 2), JSON.stringify(X.bundleSchema, null, 2));
  assert.equal(JSON.stringify(CONTRIBUTION_EXAMPLE, null, 2), JSON.stringify(X.example, null, 2));
});

test('projectFingerprint equals the prototype fingerprint of the validated document for every example', () => {
  for (const { name, raw } of exampleProjects()) {
    assert.equal(projectFingerprint(raw), X.fingerprint(core.validateProject(raw)), name);
    assert.match(projectFingerprint(raw), /^[0-9a-f]{16}$/);
  }
  const p = base();
  const edited = clone(p);
  edited.nodes[2]!.title = 'Changed';
  assert.notEqual(projectFingerprint(edited), projectFingerprint(p));
});

test('the contribution task text is byte-identical to the prototype for every example, task and language', () => {
  const blank = createBlankProject({
    mode: 'decision',
    projectId: 'p-1',
    rootId: 'r-1',
    userId: 'u-1',
    now: FIXED,
  });
  const projects = [
    ...exampleProjects(),
    { name: 'blank decision', raw: blank as unknown as Raw },
    { name: 'base', raw: base() as unknown as Raw },
  ];
  for (const { name, raw } of projects)
    for (const task of ['extend', 'assess'] as const)
      for (const language of ['fi', 'en']) {
        const request = buildContributionRequest(raw, task, language);
        assert.deepEqual(
          clone(request),
          clone(X.makeRequest(raw, core, task, language)),
          `${name} ${task} request`
        );
        assert.equal(
          buildContributionPrompt({ project: raw, task, language }),
          X.makePrompt(X.makeRequest(raw, core, task, language)),
          `${name} ${task} ${language}`
        );
      }
  assert.equal(buildContributionPrompt({ project: blank }), X.makePrompt(X.makeRequest(blank, core)));
  const extend = buildContributionRequest(blank, 'extend', 'fi');
  assert.equal((extend.responseExample.claims as Raw[])[0]!.relation, 'option');
  assert.equal((extend.responseExample.claims as Raw[])[1]!.parentId, 'option1');
  const assess = buildContributionRequest(base(), 'assess', 'fi');
  assert.deepEqual(assess.responseExample.claims, []);
  // The claim "Family time" (the first truth-assessable node) is the sample target in assess mode.
  assert.deepEqual(assess.responseExample.assessments, [
    { nodeId: 'base-0005', credence: 75, primaryInfluence: 3 },
  ]);
  assert.equal(base().nodes[2]!.id, 'base-0005');
  sameError(
    () => buildContributionRequest(blank, 'rewrite' as 'extend'),
    () => X.makeRequest(blank, core, 'rewrite'),
    'task'
  );
});

test('parseContributionBundle normalizes proposals and bundles exactly as the prototype and refuses the same inputs', () => {
  const p = base();
  for (const raw of [patch(p), richPatch(p)]) {
    assert.deepEqual(parseContributionBundle(raw), X.validate(raw));
    assert.deepEqual(parseContributionBundle(JSON.stringify(raw)), X.validate(JSON.stringify(raw)));
  }
  // The embedded example is a template, not a valid proposal: its placeholder fingerprint is refused on both sides.
  sameError(
    () => parseContributionBundle(X.example),
    () => X.validate(X.example),
    'example template'
  );
  const node = p.nodes[2]!.id;
  const cases: [string, (d: Raw) => unknown][] = [
    ['not an object', () => 'text'],
    ['unexpected key', (d) => (d.ballots = [])],
    ['missing author', (d) => delete d.author],
    ['wrong format', (d) => (d.format = 'witt-ai-review-v1')],
    ['bad projectId', (d) => (d.projectId = 'has space')],
    ['short fingerprint', (d) => (d.baseFingerprint = 'abc')],
    ['long fingerprint', (d) => (d.baseFingerprint = 'x'.repeat(17))],
    ['uppercase fingerprint', (d) => (d.baseFingerprint = 'ABCDEF0123456789')],
    ['author extra key', (d) => (d.author = { kind: 'ai', name: 'M', model: 'x' })],
    ['author kind', (d) => (d.author = { kind: 'robot', name: 'M' })],
    ['author blank name', (d) => (d.author = { kind: 'ai', name: ' ' })],
    [
      'claims count',
      (d) =>
        (d.claims = Array.from({ length: 201 }, (_, i) => ({
          tempId: `t${i}`,
          parentId: node,
          relation: 'support',
          title: 'x',
        }))),
    ],
    ['claim unexpected key', (d) => ((d.claims as Raw[])[0]!.credence = 5)],
    ['claim bad tempId', (d) => ((d.claims as Raw[])[0]!.tempId = 'a.b')],
    ['claim bad relation', (d) => ((d.claims as Raw[])[0]!.relation = 'group')],
    ['claim long details', (d) => ((d.claims as Raw[])[0]!.details = 'x'.repeat(5001))],
    ['claim bad semanticType', (d) => ((d.claims as Raw[])[0]!.semanticType = 'opinion')],
    ['claim gate status without gate', (d) => ((d.claims as Raw[])[0]!.constraintStatus = 'met')],
    ['claim bad authorVisibility', (d) => ((d.claims as Raw[])[0]!.authorVisibility = 'hidden')],
    ['duplicate claims', (d) => (d.claims as Raw[]).push({ ...(d.claims as Raw[])[0]! })],
    ['edit no changes', (d) => (d.edits = [{ nodeId: node }])],
    ['edit bad gate status', (d) => (d.edits = [{ nodeId: node, constraintStatus: 'maybe' }])],
    [
      'duplicate edits',
      (d) =>
        (d.edits = [
          { nodeId: node, title: 'a' },
          { nodeId: node, title: 'b' },
        ]),
    ],
    ['link bad relation', (d) => (d.links = [{ sourceId: 'fresh', targetId: node, relation: 'neutral' }])],
    [
      'link bad influence',
      (d) => (d.links = [{ sourceId: 'fresh', targetId: node, relation: 'support', influence: 1.3 }]),
    ],
    [
      'duplicate links',
      (d) =>
        (d.links = [
          { sourceId: 'fresh', targetId: node, relation: 'support' },
          { sourceId: 'fresh', targetId: node, relation: 'oppose' },
        ]),
    ],
    [
      'shared reason credence',
      (d) => (d.sharedReasons = [{ tempId: 's', title: 'x', credence: 3.5, influence: 1 }]),
    ],
    [
      'shared reason missing influence',
      (d) => (d.sharedReasons = [{ tempId: 's', title: 'x', credence: 50 }]),
    ],
    [
      'duplicate shared reasons',
      (d) =>
        (d.sharedReasons = [
          { tempId: 's', title: 'x', credence: 50, influence: 1 },
          { tempId: 's', title: 'y', credence: 50, influence: 1 },
        ]),
    ],
    ['attachment extra key', (d) => (d.sharedAttachments = [{ reasonId: 's', parentId: node, note: 1 }])],
    [
      'duplicate attachments',
      (d) =>
        (d.sharedAttachments = [
          { reasonId: 's', parentId: node },
          { reasonId: 's', parentId: node },
        ]),
    ],
    ['assessment empty', (d) => (d.assessments = [{ nodeId: node }])],
    ['assessment credence', (d) => (d.assessments = [{ nodeId: node, credence: 222 }])],
    [
      'duplicate assessments',
      (d) =>
        (d.assessments = [
          { nodeId: node, credence: 1 },
          { nodeId: node, credence: 2 },
        ]),
    ],
    [
      'relation assessment type',
      (d) => (d.relationAssessments = [{ subjectType: 'tertiary', subjectId: node, influence: 1 }]),
    ],
    [
      'duplicate relation assessments',
      (d) =>
        (d.relationAssessments = [
          { subjectType: 'primary', subjectId: node, influence: 1 },
          { subjectType: 'primary', subjectId: node, influence: 2 },
        ]),
    ],
    [
      'duplicate primary influence',
      (d) => {
        d.assessments = [{ nodeId: node, primaryInfluence: 1 }];
        d.relationAssessments = [{ subjectType: 'primary', subjectId: node, influence: 2 }];
      },
    ],
    ['comment blank', (d) => (d.comments = [{ nodeId: node, body: '' }])],
    ['comment extra key', (d) => (d.comments = [{ nodeId: node, body: 'x', at: 1 }])],
    [
      'empty proposal',
      (d) => {
        for (const k of ['claims', 'edits', 'assessments', 'comments']) delete d[k];
      },
    ],
  ];
  const seen = new Set<string>();
  for (const [label, mutate] of cases) {
    const build = () => {
      const d = patch(p);
      const r = mutate(d);
      return r === 'text' ? '"text"' : d;
    };
    seen.add(
      sameError(
        () => parseContributionBundle(build()),
        () => X.validate(build()),
        label
      )
    );
  }
  assert.ok(seen.has('contribution: unexpected ballots'));
  assert.ok(seen.has('Author type must be ai or human'));
  assert.ok(seen.has('claims #1: invalid constraintStatus'));
  assert.ok(seen.has('Duplicate primary influence'));
  assert.ok(seen.has('Empty proposal'));
});

const choiceSets: ContributionChoices[] = [
  {},
  { source: { kind: 'human', name: 'Liisa' } },
  { source: { kind: 'ai', name: '  Model  ' } },
  { assessments: false, comments: false, edits: false },
  { assessments: false, sharedReasons: true },
  { sharedReasons: false },
  { links: false, comments: false },
  { claims: false },
  { selectedClaims: [0, 2], selectedEdits: [] },
  { selectedClaims: [], source: { kind: 'human', name: 'Tero' } },
];

test('applyContribution merges exactly as the prototype for every acceptance choice, source and proposal', () => {
  const p = base();
  const withCollision = clone(p);
  withCollision.users.push({
    id: 'ai-old',
    name: 'AI · Model',
    shares: 1,
    role: 'editor',
    profileKind: 'ai',
  });
  for (const [projectName, project] of [
    ['base', p],
    ['base with existing AI · Model', withCollision],
  ] as const)
    for (const raw of [patch(project), richPatch(project)])
      for (const choices of choiceSets) {
        const label = `${projectName} ${raw.claims === patch(project).claims ? 'patch' : 'rich'} ${JSON.stringify(choices)}`;
        const run = () => applyContribution(project, parseContributionBundle(raw), choices, clock('m'));
        const theirs = () =>
          withOracle(
            () =>
              X.merge(
                project,
                protoFiltered(raw, choices),
                core,
                protoChoices(choices),
                protoSource(choices)
              ),
            'm'
          );
        let expected: Raw;
        try {
          expected = theirs();
        } catch {
          sameError(run, theirs, label);
          continue;
        }
        const ours = run();
        assert.equal(ours.kind, 'single');
        assert.deepEqual(clone(stripKind(ours)), clone(expected), label);
        // What the preview promises is what apply installs.
        const preview = previewContribution(project, parseContributionBundle(raw), choices, clock('m'));
        assert.ok(preview.ok && preview.kind === 'single', label);
        assert.deepEqual(clone(preview.result), clone(ours), label);
      }
});

test('literal oracle: an AI proposal lands in its own AI profile; a human nickname is never labelled AI', () => {
  const p = base();
  const ai = single(applyContribution(p, parseContributionBundle(patch(p)), {}, clock('m')));
  assert.deepEqual(ai.actor, { kind: 'ai', name: 'AI · Model', id: 'm-0001' });
  assert.deepEqual(ai.nodeIdMap, { fresh: 'm-0002' });
  assert.deepEqual(ai.counts, {
    claims: 1,
    edits: 1,
    links: 0,
    sharedReasons: 0,
    sharedAttachments: 0,
    assessments: 1,
    comments: 1,
    skippedDependent: 0,
  });
  const profile = ai.project.users.find((u) => u.id === 'm-0001')!;
  assert.equal(profile.profileKind, 'ai');
  assert.equal(ai.project.nodes.find((n) => n.id === 'm-0002')!.createdBy, 'm-0001');
  assert.deepEqual(
    ai.project.votes.map((v) => [v.userId, v.nodeId, v.confidence]),
    [['m-0001', 'm-0002', 85]]
  );
  assert.equal(ai.project.nodes[2]!.title, 'Quality time');
  assert.equal(ai.project.nodes[2]!.lastEditedBy, 'm-0001');
  assert.deepEqual(
    ai.project.comments.map((c) => [c.authorId, c.authorName, c.body]),
    [
      ['m-0001', 'AI · Model', 'Muokkausehdotus hyväksytty (AI · Model).'],
      ['m-0001', 'AI · Model', 'Depends on weather'],
    ]
  );
  assert.equal(ai.project.updatedAt, FIXED);
  assert.deepEqual(clone(p), clone(base()), 'the input is untouched');
  const human = single(
    applyContribution(
      p,
      parseContributionBundle(patch(p)),
      { source: { kind: 'human', name: 'Liisa' } },
      clock('h')
    )
  );
  const person = human.project.users.find((u) => u.id === human.actor.id)!;
  assert.deepEqual([person.name, person.profileKind], ['Liisa', 'human']);
  assert.ok(human.project.comments.every((c) => c.authorId !== person.id || c.authorName === 'Liisa'));
});

test('excluding ratings excludes locked shared reasons too, and excluded categories leave nothing behind', () => {
  const p = base();
  const raw = richPatch(p);
  const noRatings = applyContribution(
    p,
    parseContributionBundle(raw),
    { assessments: false, sharedReasons: true },
    clock('m')
  );
  assert.deepEqual(noRatings.project.sharedReasons, []);
  assert.ok(!noRatings.project.nodes.some((n) => n.sharedReasonId));
  assert.deepEqual([noRatings.project.votes, noRatings.project.edgeAssessments], [[], []]);
  assert.equal(noRatings.counts.sharedReasons, 0);
  assert.equal(noRatings.counts.assessments, 0);
  assert.ok(noRatings.project.nodes.some((n) => n.title === 'Crowded'));
  const nothing = applyContribution(
    p,
    parseContributionBundle(raw),
    { assessments: false, comments: false, edits: false },
    clock('m')
  );
  assert.equal(nothing.project.comments.length, 0);
  assert.equal(nothing.project.nodes[2]!.title, 'Family time');
  const deselected = applyContribution(
    p,
    parseContributionBundle(raw),
    { selectedClaims: [2], selectedEdits: [0] },
    clock('m')
  );
  assert.equal(deselected.counts.claims, 1);
  assert.equal(
    deselected.counts.skippedDependent,
    4,
    'the link from "deep", the assessments of "fresh" and "deep" and the comment on "fresh" pointed at dropped claims'
  );
});

test('merge refusals carry the prototype message and never touch the document', () => {
  const p = base();
  const before = JSON.stringify(p);
  const cases: [string, (d: Raw) => void, ContributionChoices][] = [
    ['stale', (d) => (d.baseFingerprint = '0123456789abcdef'), {}],
    ['foreign', (d) => (d.projectId = 'foreign'), {}],
    ['nothing selected', () => {}, { claims: false, edits: false, assessments: false, comments: false }],
    ['blank source name', () => {}, { source: { kind: 'human', name: ' ' } }],
    ['robot source', () => {}, { source: { kind: 'robot' as 'ai', name: 'Me' } }],
    ['tempId collides', (d) => ((d.claims as Raw[])[0]!.tempId = p.nodes[2]!.id), {}],
    ['semantics on an option', (d) => (d.edits = [{ nodeId: p.nodes[1]!.id, semanticType: 'value' }]), {}],
    [
      'gate status without gate',
      (d) => (d.edits = [{ nodeId: p.nodes[2]!.id, constraintStatus: 'met' }]),
      {},
    ],
    ['credence on an option', (d) => (d.assessments = [{ nodeId: p.nodes[1]!.id, credence: 50 }]), {}],
    ['missing parent chain', (d) => ((d.claims as Raw[])[0]!.parentId = 'ghost'), {}],
    [
      'link cycle',
      (d) => (d.links = [{ sourceId: 'fresh', targetId: p.nodes[1]!.id, relation: 'support' }]),
      {},
    ],
  ];
  for (const [label, mutate, choices] of cases) {
    const raw = patch(p);
    mutate(raw);
    // The preview surfaces the prototype's merge message; apply then installs what the preview computed.
    const ours = () => {
      const preview = previewContribution(p, parseContributionBundle(raw), choices, clock('m'));
      if (!preview.ok) throw new Error(preview.message);
      return applyContribution(p, parseContributionBundle(raw), choices, clock('m'));
    };
    sameError(
      ours,
      () => withOracle(() => X.merge(p, raw, core, protoChoices(choices), protoSource(choices)), 'm'),
      label
    );
  }
  assert.equal(JSON.stringify(p), before);
  // At apply time a changed document is refused with the prototype's Finnish message (its importContribution);
  // a foreign id with a matching fingerprint cannot happen for a real export and falls through to the merge refusal.
  const stale = patch(p);
  stale.baseFingerprint = '0123456789abcdef';
  assert.throws(() => applyContribution(p, parseContributionBundle(stale), {}, clock('m')), {
    message: 'Dokumentti on muuttunut ehdotuksen viennin jälkeen.',
  });
  const foreign = patch(p);
  foreign.projectId = 'foreign';
  assert.throws(() => applyContribution(p, parseContributionBundle(foreign), {}, clock('m')), {
    message: 'Proposal belongs to a different document',
  });
  const locked = withOracle(() => {
    const next = core.validateProject(p);
    const reason = core.addSharedReason(next, 'Locked', 80, 2);
    core.attachSharedReason(next, reason.id, next.nodes[1].id, next.users[0].id);
    return core.validateProject(next) as Project;
  }, 'lock');
  const editLocked = { ...patch(locked), edits: [{ nodeId: locked.nodes[3]!.id, title: 'Unlock' }] };
  sameError(
    () => applyContribution(locked, parseContributionBundle(editLocked), {}, clock('m')),
    () => withOracle(() => X.merge(locked, editLocked, core), 'm'),
    'locked'
  );
});

test('previewContribution reports what the dialog shows: labels, rows and the reason a proposal cannot be merged', () => {
  const p = base();
  const preview = previewContribution(p, parseContributionBundle(richPatch(p)), {}, clock('m'));
  assert.ok(preview.ok && preview.kind === 'single');
  assert.deepEqual(preview.items, {
    claims: ['oppose: Crowded', 'support: Pool is open', 'option: Stay home', 'neutral: Weather unknown'],
    edits: ['Family time → Quality time', 'fresh → fact'],
  });
  assert.deepEqual(preview.assessmentRows, [
    { label: 'fresh', credence: 85, influence: -3 },
    { label: 'Family time', credence: 60, influence: null },
    { label: 'deep', credence: 40, influence: 0 },
  ]);
  assert.deepEqual(preview.commentRows, [
    { label: 'Crowded', body: 'Depends on weather' },
    { label: 'Family time', body: 'Agreed' },
  ]);
  const quiet = previewContribution(
    p,
    parseContributionBundle(richPatch(p)),
    { assessments: false, comments: false },
    clock('m')
  );
  assert.ok(quiet.ok && quiet.kind === 'single');
  assert.deepEqual([quiet.assessmentRows, quiet.commentRows], [[], []]);
  const stale = patch(p);
  stale.baseFingerprint = '0123456789abcdef';
  assert.deepEqual(previewContribution(p, parseContributionBundle(stale), {}, clock('m')), {
    ok: false,
    code: 'stale',
    message: 'Document changed since proposal export; do not overwrite blindly',
  });
  const foreign = patch(p);
  foreign.projectId = 'foreign';
  assert.deepEqual(previewContribution(p, parseContributionBundle(foreign), {}, clock('m')), {
    ok: false,
    code: 'wrong-project',
    message: 'Proposal belongs to a different document',
  });
  assert.deepEqual(
    previewContribution(
      p,
      parseContributionBundle(patch(p)),
      { source: { kind: 'human', name: '' } },
      clock('m')
    ),
    {
      ok: false,
      code: 'invalid',
      message: 'source name: invalid text',
    }
  );
});

/** The prototype's multi-author fixture: Aino (owner) and Ben each add, rate and comment. */
function multiAuthor() {
  return withOracle(() => {
    const original = core.createBlankProject('argument');
    const owner = original.users[0];
    owner.name = 'Aino';
    const edited = core.validateProject(original);
    edited.users.push({ id: 'local_b', name: 'Ben', shares: 1, role: 'editor', profileKind: 'human' });
    const a = core.addChild(edited, edited.nodes[0].id, 'support', owner.id);
    a.title = 'Ainon peruste';
    const b = core.addChild(edited, a.id, 'support', 'local_b');
    b.title = 'Benin peruste';
    core.upsertVote(edited, a.id, owner.id, 74);
    core.upsertEdgeAssessment(edited, 'primary', a.id, owner.id, 3);
    core.upsertVote(edited, b.id, 'local_b', 89);
    core.upsertEdgeAssessment(edited, 'primary', b.id, 'local_b', -2.5);
    core.upsertVote(edited, a.id, 'local_b', 65);
    core.addComment(edited, a.id, 'Ainon kommentti', owner.name, owner.id);
    core.addComment(edited, a.id, 'Benin kommentti', 'Ben', 'local_b');
    return {
      original: core.validateProject(original) as Project,
      edited: core.validateProject(edited) as Project,
      owner: owner as Project['users'][0],
      a,
      b,
    };
  }, 'ma');
}

test("diffContribution exports one person's changes exactly as the prototype diff, strict and lenient", () => {
  const p = base();
  const e = withOracle(() => {
    const next = core.validateProject(p);
    const human = next.users[0];
    const fresh = core.addChild(next, next.nodes[1].id, 'support', human.id);
    fresh.title = 'Exercise';
    next.nodes[2].details = 'Reworded detail';
    const other = core.addChild(next, next.nodes[1].id, 'oppose', human.id);
    other.title = 'Noise';
    const link = core.addLink(next, other.id, fresh.id, 'oppose', 0);
    link.createdBy = human.id;
    core.upsertVote(next, fresh.id, human.id, 76);
    core.upsertEdgeAssessment(next, 'primary', fresh.id, human.id, 4);
    core.upsertEdgeAssessment(next, 'secondary', link.id, human.id, -1.5);
    core.addComment(next, fresh.id, 'My comment', human.name, human.id);
    core.addComment(next, fresh.id, 'Legacy note', human.name);
    const reason = core.addSharedReason(next, 'Costs', 70, -1);
    core.attachSharedReason(next, reason.id, next.nodes[1].id, human.id);
    return core.validateProject(next) as Project;
  }, 'e');
  const human = p.users[0]!;
  for (const strict of [false, true])
    for (const name of ['Nimimerkki', null]) {
      const ours = diffContribution(p, e, name, human.id, { strictAttribution: strict });
      const theirs = X.diff(p, e, core, name, human.id, { strictAttribution: strict });
      assert.deepEqual(ours, theirs, `strict=${strict} name=${name}`);
      assert.equal(ours.author.kind, 'human');
      assert.equal(ours.author.name, name ?? 'Minä');
    }
  const lenient = diffContribution(p, e, 'Nimimerkki', human.id);
  assert.equal(lenient.claims.length, 2);
  assert.equal(lenient.edits.length, 1);
  assert.equal(
    lenient.comments.length,
    2,
    'a legacy comment with only a matching name counts without strict attribution'
  );
  assert.equal(lenient.sharedReasons.length, 1);
  assert.equal(lenient.sharedAttachments.length, 1);
  assert.deepEqual(lenient.links, [
    { sourceId: e.nodes[4]!.id, targetId: e.nodes[3]!.id, relation: 'oppose', influence: -1.5 },
  ]);
  const strict = diffContribution(p, e, 'Nimimerkki', human.id, { strictAttribution: true });
  assert.equal(strict.comments.length, 1);
  assert.equal(strict.edits.length, 0, 'the detail edit carries no lastEditedBy');
  assert.equal(
    strict.sharedReasons.length,
    0,
    'a validated shared reason carries no createdBy: never exported strictly'
  );
  // Round trip: the exported patch merges back into the original as the prototype's merge does.
  const merged = single(applyContribution(p, parseContributionBundle(lenient), {}, clock('r')));
  assert.deepEqual(clone(stripKind(merged)), clone(withOracle(() => X.merge(p, lenient, core), 'r')));
  assert.ok(merged.project.votes.some((v) => v.userId === merged.actor.id && v.confidence === 76));
  const ai = clone(p);
  ai.users.push({ id: 'bot', name: 'Bot', shares: 1, role: 'editor', profileKind: 'ai' });
  sameError(
    () => diffContribution(ai, ai, null, 'bot'),
    () => X.diff(ai, ai, core, null, 'bot'),
    'ai profile'
  );
  const other = clone(p);
  other.id = 'other';
  sameError(
    () => diffContribution(p, other, null, human.id),
    () => X.diff(p, other, core, null, human.id),
    'different ids'
  );
  const moded = clone(p);
  moded.mode = 'argument';
  moded.nodes[0]!.kind = 'claim';
  moded.nodes = moded.nodes.slice(0, 1);
  sameError(
    () => diffContribution(p, moded, null, human.id),
    () => X.diff(p, moded, core, null, human.id),
    'mode changed'
  );
});

test('exportContribution and the bundle merge match the prototype for every multi-author scenario', () => {
  const scenarios: [string, (f: ReturnType<typeof multiAuthor>) => void][] = [
    ['plain', () => {}],
    ['untracked root edit', (f) => (f.edited.nodes[0]!.title = 'Changed title without tracking')],
    [
      'tracked edit by Ben',
      (f) => {
        f.edited.nodes[0]!.title = 'Benin otsikko';
        f.edited.nodes[0]!.lastEditedBy = 'local_b';
      },
    ],
    [
      'legacy anonymous comment and untracked link',
      (f) => {
        f.edited.comments.push({
          id: 'legacy-1',
          nodeId: f.original.nodes[0]!.id,
          body: 'Vanhasta tuonnista',
          authorName: 'Aino',
          createdAt: FIXED,
        });
        f.edited.links.push({
          id: 'link-1',
          sourceId: f.b.id,
          targetId: f.original.nodes[0]!.id,
          relation: 'support',
          impact: 0,
        });
      },
    ],
  ];
  for (const [label, prepare] of scenarios)
    for (const selected of [undefined, ['local_b'], [multiAuthor().owner.id]]) {
      const f = multiAuthor();
      prepare(f);
      const ours = exportContribution(f.original, f.edited, selected);
      const theirs = X.diffBundle(f.original, f.edited, core, selected);
      assert.deepEqual(ours, theirs, `${label} ${JSON.stringify(selected)}`);
      const mergeOurs = () => applyContribution(f.original, parseContributionBundle(ours), {}, clock('b'));
      const mergeTheirs = () => withOracle(() => X.mergeBundle(f.original, ours, core), 'b');
      let expected: Raw;
      try {
        expected = mergeTheirs();
      } catch {
        // Ben alone references Aino's unexported node: both sides refuse the bundle with the same message.
        assert.equal(
          sameError(mergeOurs, mergeTheirs, `${label} ${JSON.stringify(selected)}`),
          'Unresolved cross-user references in collaborative proposal'
        );
        continue;
      }
      const merged = mergeOurs();
      assert.equal(merged.kind, 'bundle');
      assert.deepEqual(clone(stripKind(merged)), clone(expected), `${label} merge`);
      const renamed = applyContribution(
        f.original,
        parseContributionBundle(ours),
        { names: { local_b: 'Benjamin' } },
        clock('b')
      );
      assert.deepEqual(
        clone(stripKind(renamed)),
        clone(withOracle(() => X.mergeBundle(f.original, ours, core, {}, { local_b: 'Benjamin' }), 'b')),
        `${label} renamed`
      );
      const preview = previewContribution(f.original, parseContributionBundle(ours), {}, clock('b'));
      assert.ok(preview.ok && preview.kind === 'bundle');
      assert.deepEqual(clone(preview.result), clone(merged));
    }
});

test('literal oracle: the bundle keeps each person separate and reports what it could not attribute', () => {
  const f = multiAuthor();
  f.edited.nodes[0]!.title = 'Changed title without tracking';
  f.edited.comments.push({
    id: 'legacy-1',
    nodeId: f.original.nodes[0]!.id,
    body: 'Vanhasta tuonnista',
    authorName: 'Aino',
    createdAt: FIXED,
  });
  const bundle = exportContribution(f.original, f.edited);
  assert.equal(bundle.format, 'witt-contribution-bundle-v1');
  assert.deepEqual(
    bundle.contributors.map((c) => [c.sourceUserId, c.name]),
    [
      [f.owner.id, 'Aino'],
      ['local_b', 'Ben'],
    ]
  );
  assert.deepEqual(bundle.unattributedEdits, [
    { nodeId: f.original.nodes[0]!.id, title: 'Changed title without tracking' },
  ]);
  assert.equal(bundle.unattributedComments, 1);
  assert.equal(bundle.unattributedLinks, 0);
  const [aino, ben] = bundle.contributors.map((c) => c.patch);
  assert.equal(aino!.claims[0]!.title, 'Ainon peruste');
  assert.equal(ben!.claims[0]!.parentId, f.a.id, "Ben's claim hangs under Aino's not-yet-imported node");
  assert.deepEqual(
    ben!.assessments.find((r) => r.nodeId === f.a.id),
    { nodeId: f.a.id, credence: 65 }
  );
  const merged = applyContribution(f.original, bundle, {}, clock('b'));
  assert.equal(merged.kind, 'bundle');
  if (merged.kind !== 'bundle') return;
  assert.deepEqual(
    merged.actors.map((a) => [a.sourceUserId, a.id, a.name]),
    [
      [f.owner.id, f.owner.id, 'Aino'],
      ['local_b', 'b-0005', 'Ben'],
    ]
  );
  const newA = merged.project.nodes.find((n) => n.title === 'Ainon peruste')!;
  const newB = merged.project.nodes.find((n) => n.title === 'Benin peruste')!;
  assert.equal(newB.parentId, newA.id);
  assert.equal(newA.createdBy, f.owner.id, 'the same person in the same document keeps her profile');
  assert.equal(newB.createdBy, 'b-0005');
  assert.equal(
    merged.project.votes.find((v) => v.userId === 'b-0005' && v.nodeId === newA.id)!.confidence,
    65
  );
  assert.equal(
    merged.project.nodes[0]!.title,
    f.original.nodes[0]!.title,
    'the untracked edit is not applied'
  );
  assert.ok(!merged.project.comments.some((c) => c.body === 'Vanhasta tuonnista'));
  assert.deepEqual(
    [merged.unattributedEdits, merged.unattributedComments, merged.unattributedLinks],
    [1, 1, 0]
  );
  const noChanges = multiAuthor();
  sameError(
    () => exportContribution(noChanges.original, noChanges.original),
    () => X.diffBundle(noChanges.original, noChanges.original, core),
    'nothing to export'
  );
  bundle.contributors.push(bundle.contributors[0]!);
  sameError(
    () => parseContributionBundle(bundle),
    () => X.validateBundle(bundle),
    'duplicate contributor'
  );
  bundle.contributors.pop();
  bundle.contributors[0]!.patch.author.name = 'Someone else';
  sameError(
    () => parseContributionBundle(bundle),
    () => X.validateBundle(bundle),
    'attribution mismatch'
  );
});

test('a realistic round trip over every example: a person edits, exports, and the bundle merges back identically', () => {
  let keyless = 0;
  for (const { name, raw } of exampleProjects()) {
    const original = core.validateProject(raw) as Project;
    const person = original.users.find((u) => u.profileKind !== 'ai')!;
    const edit = (base: Project) => {
      const next = core.validateProject(base);
      const target =
        next.nodes.find(
          (n: Project['nodes'][number]) => n.kind === 'claim' && !n.sharedReasonId && n.parentId
        ) ?? next.nodes[0];
      const fresh = core.addChild(next, target.id, 'oppose', person.id);
      fresh.title = 'Vastaväite viennin testiin';
      core.upsertVote(next, fresh.id, person.id, 35);
      core.upsertEdgeAssessment(next, 'primary', fresh.id, person.id, -2);
      core.addComment(next, fresh.id, 'Huomio', person.name, person.id);
      return core.validateProject(next) as Project;
    };
    if (original.sharedReasons === undefined) {
      // A document without the optional `sharedReasons` key crashes the prototype's diff and merge (TypeError on
      // `undefined.map`); the port reads the key as empty. Pinned here so the difference stays deliberate.
      keyless++;
      const edited = withOracle(() => edit(original), 'x');
      assert.throws(() => X.diffBundle(original, edited, core, [person.id]), TypeError, name);
      const bundle = exportContribution(original, edited, [person.id]);
      assert.equal(bundle.contributors.length, 1, name);
      assert.equal(applyContribution(original, bundle, {}, clock('y')).counts.claims, 1, name);
      continue;
    }
    const edited = withOracle(() => edit(original), 'x');
    const bundle = exportContribution(original, edited, [person.id]);
    assert.deepEqual(bundle, X.diffBundle(original, edited, core, [person.id]), name);
    const merged = applyContribution(original, bundle, {}, clock('y'));
    assert.deepEqual(
      clone(stripKind(merged)),
      clone(withOracle(() => X.mergeBundle(original, bundle, core), 'y')),
      name
    );
  }
  assert.ok(keyless < exampleProjects().length, 'most examples carry the sharedReasons key');
});
