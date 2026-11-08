/**
 * must: the `witt-ai-draft-v2` port reproduces the frozen prototype's `src/ai-draft-v2.js` exactly — the AI task text
 *       byte for byte, the schema and example objects, every accepted draft's normalized shape, every refusal message,
 *       and the document `toProject` builds (same ids with the same counting id source, same clock) for every draft
 *       file the prototype ships and every include/exclude combination; the AI's ratings never reach a human profile
 * test: tests/unit/ai-draft.test.ts (the prototype module is loaded as the oracle)
 * red-against: a prompt paragraph reworded, a schema key reordered, `semanticType` left undefined instead of 'fact',
 *              ratings imported when "Tuo arvioinnit" is off, locked shared reasons imported without ratings, an id
 *              drawn in a different order, the root authored by "Minä" instead of the AI profile
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  DRAFT_EXAMPLE,
  DRAFT_FORMAT,
  DRAFT_SCHEMA,
  buildDraftPrompt,
  draftSummary,
  draftToProject,
  parseAiDraft,
} from '../../src/domain/index.ts';
import { clock, clone, draftFiles, proto, protoDir, readJson, sameError, withOracle } from './ai-oracle.ts';

const sample = () => clone(draftFiles()[0]!.raw);
type Mutation = [label: string, mutate: (d: Record<string, unknown>) => unknown];
const claims = (d: Record<string, unknown>) => d.claims as Record<string, unknown>[];

test('buildDraftPrompt is byte-identical to the prototype task for every mode, language and input shape', () => {
  const inputs = [
    {},
    { mode: 'decision' as const },
    { mode: 'argument' as const, topic: 'Ostetaanko lämpöpumppu?', language: 'fi' },
    { topic: '  padded topic  ', context: 'line one\nline two\n', language: 'en' },
    { mode: 'decision' as const, topic: 'x'.repeat(6000), context: 'y'.repeat(60000), language: 'zh-Hans' },
    { topic: '', context: '', language: 'ko' },
  ];
  for (const input of inputs) assert.equal(buildDraftPrompt(input), proto.draft.buildTask(input));
  assert.equal(buildDraftPrompt(), proto.draft.buildTask());
  sameError(
    () => buildDraftPrompt({ mode: 'vote' as 'argument' }),
    () => proto.draft.buildTask({ mode: 'vote' }),
    'invalid mode'
  );
  assert.ok(buildDraftPrompt({ language: 'de' }).includes('Return the document in language de.'));
});

test("the owner's pasted task fixture is the decision prompt for its topic and material, in Finnish", () => {
  const fixture = readFileSync(
    path.join(process.cwd(), 'tests', 'fixtures', 'ai-task-decision-fi.txt'),
    'utf8'
  );
  const prompt = buildDraftPrompt({
    mode: 'decision',
    topic: 'Kannattaako ostoskeskuksen asiakkaille tarjota 3 tunnin ilmainen pysäköinti?',
    context:
      'Tämä on erityisesti Espoon Isossa Omenassa ja Lippulaivassa ja Ainoassa kismittänyt espoolaisia.',
    language: 'fi',
  });
  // The owner's paste abbreviates the schema block with one placeholder line; everything else is the exact task.
  const schemaBlock = '```json\n' + JSON.stringify(DRAFT_SCHEMA, null, 2) + '\n```';
  const placeholder =
    "(the witt-ai-draft-v2 schema follows here in the prototype's output; see witt-grace-gpt-proto/src/ai-draft-v2.js)";
  assert.ok(prompt.includes(schemaBlock));
  assert.equal(fixture, prompt.replace(schemaBlock, placeholder) + '\n');
  assert.equal(
    prompt,
    proto.draft.buildTask({
      mode: 'decision',
      topic: 'Kannattaako ostoskeskuksen asiakkaille tarjota 3 tunnin ilmainen pysäköinti?',
      context:
        'Tämä on erityisesti Espoon Isossa Omenassa ja Lippulaivassa ja Ainoassa kismittänyt espoolaisia.',
      language: 'fi',
    })
  );
});

test('DRAFT_SCHEMA and DRAFT_EXAMPLE equal the prototype objects and the shipped schema file, key order included', () => {
  assert.equal(DRAFT_FORMAT, proto.draft.FORMAT);
  assert.equal(JSON.stringify(DRAFT_SCHEMA, null, 2), JSON.stringify(proto.draft.schema, null, 2));
  assert.equal(
    JSON.stringify(DRAFT_SCHEMA),
    JSON.stringify(readJson(path.join(protoDir, 'schemas', 'ai-draft.v2.schema.json')))
  );
  assert.equal(JSON.stringify(DRAFT_EXAMPLE, null, 2), JSON.stringify(proto.draft.EXAMPLE, null, 2));
});

test('parseAiDraft normalizes every shipped draft exactly as the prototype validate', () => {
  for (const { name, raw } of draftFiles()) {
    assert.deepEqual(parseAiDraft(raw), proto.draft.validate(raw), name);
    assert.deepEqual(
      parseAiDraft(JSON.stringify(raw)),
      proto.draft.validate(JSON.stringify(raw)),
      `${name} text`
    );
  }
  assert.deepEqual(parseAiDraft(DRAFT_EXAMPLE), proto.draft.validate(proto.draft.EXAMPLE));
  const parsed = parseAiDraft(sample());
  assert.equal(parsed.claims[0]!.semanticType, 'fact');
  assert.equal(parsed.claims[0]!.details, '');
  assert.equal(parsed.root.details, '');
  assert.deepEqual(parsed.links, []);
});

test('parseAiDraft refuses exactly what the prototype refuses, with the same message', () => {
  const mutations: Mutation[] = [
    ['not an object', () => 42],
    ['unexpected key', (d) => (d.extra = 1)],
    ['missing assessor', (d) => delete d.assessor],
    ['wrong format', (d) => (d.format = 'witt-ai-draft-v1')],
    ['bad mode', (d) => (d.mode = 'vote')],
    ['blank assessor', (d) => (d.assessor = '   ')],
    ['long assessor', (d) => (d.assessor = 'a'.repeat(71))],
    ['blank title', (d) => (d.title = '')],
    ['root extra key', (d) => ((d.root as Record<string, unknown>).credenceNote = 'x')],
    ['root missing title', (d) => delete (d.root as Record<string, unknown>).title],
    ['root bad id', (d) => ((d.root as Record<string, unknown>).id = '1abc')],
    ['decision root credence', (d) => ((d.root as Record<string, unknown>).credence = 70)],
    ['root details number', (d) => ((d.root as Record<string, unknown>).details = 5)],
    [
      'argument root credence out of range',
      (d) => {
        d.mode = 'argument';
        claims(d).forEach((c) => {
          if (c.relation === 'option') c.relation = 'support';
        });
        (d.root as Record<string, unknown>).credence = 150;
      },
    ],
    ['claims not array', (d) => (d.claims = {})],
    [
      'too many claims',
      (d) =>
        (d.claims = Array.from({ length: 201 }, (_, i) => ({
          id: `c${i}`,
          parentId: 'root',
          relation: 'support',
          title: 'x',
        }))),
    ],
    ['claim extra key', (d) => (claims(d)[1]!.weight = 3)],
    ['claim missing parentId', (d) => delete claims(d)[1]!.parentId],
    ['duplicate claim id', (d) => (claims(d)[2]!.id = claims(d)[0]!.id)],
    ['claim id equals root', (d) => (claims(d)[0]!.id = 'root')],
    ['bad relation', (d) => (claims(d)[1]!.relation = 'helps')],
    ['bad semantic type', (d) => (claims(d)[1]!.semanticType = 'opinion')],
    ['option with credence', (d) => (claims(d)[0]!.credence = 50)],
    ['value with credence', (d) => (claims(d)[1]!.semanticType = 'value')],
    ['option with influence', (d) => (claims(d)[0]!.influence = 2)],
    ['blank claim title', (d) => (claims(d)[1]!.title = ' ')],
    ['claim details number', (d) => (claims(d)[1]!.details = 1)],
    ['fractional credence', (d) => (claims(d)[1]!.credence = 70.5)],
    ['credence string', (d) => (claims(d)[1]!.credence = '70')],
    ['quarter-step influence', (d) => (claims(d)[1]!.influence = 0.25)],
    ['influence out of range', (d) => (claims(d)[1]!.influence = 5.5)],
    ['blank comment', (d) => (claims(d)[1]!.comment = '')],
    ['sharedReasons not array', (d) => (d.sharedReasons = 'none')],
    ['shared reason extra key', (d) => ((d.sharedReasons as Record<string, unknown>[])[0]!.note = 'x')],
    ['shared reason bad id', (d) => ((d.sharedReasons as Record<string, unknown>[])[0]!.id = '-x')],
    [
      'duplicate shared reason',
      (d) =>
        (d.sharedReasons as Record<string, unknown>[]).push({
          ...(d.sharedReasons as Record<string, unknown>[])[0]!,
        }),
    ],
    ['attachment bad ids', (d) => ((d.sharedAttachments as Record<string, unknown>[])[0]!.parentId = '')],
    ['attachment extra key', (d) => ((d.sharedAttachments as Record<string, unknown>[])[0]!.weight = 1)],
    ['links not array', (d) => (d.links = {})],
    [
      'link bad relation',
      (d) => (d.links = [{ sourceId: 'family', targetId: 'clean', relation: 'neutral' }]),
    ],
    [
      'link bad influence',
      (d) => (d.links = [{ sourceId: 'family', targetId: 'clean', relation: 'support', influence: 7 }]),
    ],
    ['link missing target', (d) => (d.links = [{ sourceId: 'family', relation: 'support' }])],
    ['comment bad target', (d) => (d.comments = [{ nodeId: '9x', body: 'hi' }])],
    ['comment blank body', (d) => (d.comments = [{ nodeId: 'family', body: '  ' }])],
    [
      'comments too many',
      (d) => (d.comments = Array.from({ length: 301 }, () => ({ nodeId: 'family', body: 'x' }))),
    ],
  ];
  const seen = new Set<string>();
  for (const [label, mutate] of mutations) {
    const build = () => {
      const d = sample();
      const replaced = mutate(d);
      return replaced === 42 ? 42 : d;
    };
    seen.add(
      sameError(
        () => parseAiDraft(build()),
        () => proto.draft.validate(build()),
        label
      )
    );
  }
  assert.ok(seen.has('draft: unexpected extra'));
  assert.ok(seen.has('Decision question cannot have a truth estimate'));
  assert.ok(seen.has('claim 2: no credence for non-factual nodes'));
  assert.ok(seen.has('Influence must be -5..+5 in 0.5 steps'));
  assert.ok(seen.has('Duplicate shared reason'));
});

const optionSets = [
  {},
  { includeRatings: false },
  { includeComments: false },
  { includeShared: false },
  { includeRatings: false, includeShared: true, includeComments: false },
];
const protoOptions = (o: {
  includeRatings?: boolean;
  includeComments?: boolean;
  includeShared?: boolean;
}) => ({
  ...(o.includeRatings === undefined ? {} : { assessments: o.includeRatings }),
  ...(o.includeComments === undefined ? {} : { comments: o.includeComments }),
  ...(o.includeShared === undefined ? {} : { sharedReasons: o.includeShared }),
});

test('draftToProject builds the prototype document for every shipped draft and option combination', () => {
  const drafts = [...draftFiles(), { name: 'EXAMPLE', raw: proto.draft.EXAMPLE as Record<string, unknown> }];
  for (const { name, raw } of drafts)
    for (const options of optionSets) {
      const ours = draftToProject(raw, { ...options, ...clock('d') });
      const theirs = withOracle(() => proto.draft.toProject(raw, proto.core, protoOptions(options)), 'd');
      assert.deepEqual(clone(ours), clone(theirs), `${name} ${JSON.stringify(options)}`);
      const ai = ours.users.find((u) => u.profileKind === 'ai')!;
      assert.ok(ai, 'an AI profile exists');
      assert.ok(
        ours.nodes.every((n) => n.createdBy === ai.id),
        'the AI authored every node'
      );
      assert.ok(
        ours.votes.every((v) => v.userId === ai.id) && ours.edgeAssessments.every((a) => a.userId === ai.id)
      );
      if (options.includeRatings === false) {
        assert.deepEqual(ours.votes, []);
        assert.deepEqual(ours.edgeAssessments, []);
        assert.deepEqual(ours.sharedReasons, []);
      }
    }
});

test('draftToProject with the dev14 example: literal ids, the AI profile, its ratings and the locked shared reason', () => {
  const p = draftToProject(sample(), clock('d'));
  assert.deepEqual(
    p.users.map((u) => ({ id: u.id, name: u.name, kind: u.profileKind ?? 'human' })),
    [
      { id: 'd-0001', name: 'Minä', kind: 'human' },
      { id: 'd-0004', name: 'AI · Esimerkki-AI', kind: 'ai' },
    ]
  );
  assert.equal(p.id, 'd-0003');
  assert.equal(p.nodes[0]!.id, 'd-0002');
  assert.equal(p.title, 'Mitä tekisin lauantaina?');
  assert.deepEqual(
    p.votes.map((v) => [v.nodeId, v.confidence]),
    [
      ['d-0006', 70],
      ['d-0011', 90],
      ['d-0015', 85],
    ]
  );
  assert.deepEqual(
    p.edgeAssessments.map((a) => [a.subjectId, a.influence]),
    [
      ['d-0006', 4],
      ['d-0011', 4],
      ['d-0015', 3],
    ]
  );
  assert.deepEqual(p.sharedReasons, [
    { id: 'd-0018', title: 'Matkakustannuksia syntyy', confidence: 90, influence: -2 },
  ]);
  assert.equal(p.nodes.filter((n) => n.sharedReasonId === 'd-0018').length, 2);
  assert.deepEqual(
    p.comments.map((c) => [c.authorId, c.body]),
    [['d-0004', 'Toteutumiseen liittyy epävarmuutta.']]
  );
});

test('draftToProject refuses dangling or illegal references with the prototype message', () => {
  const cases: Mutation[] = [
    ['missing parent', (d) => (claims(d)[1]!.parentId = 'ghost')],
    [
      'cycle',
      (d) => {
        claims(d)[1]!.parentId = claims(d)[3]!.id;
        claims(d)[3]!.parentId = claims(d)[1]!.id;
      },
    ],
    [
      'unknown shared reason',
      (d) => ((d.sharedAttachments as Record<string, unknown>[])[0]!.reasonId = 'nope'),
    ],
    [
      'unknown attachment parent',
      (d) => ((d.sharedAttachments as Record<string, unknown>[])[0]!.parentId = 'nope'),
    ],
    [
      'unknown link endpoint',
      (d) => (d.links = [{ sourceId: 'family', targetId: 'nope', relation: 'support' }]),
    ],
    [
      'link to own parent',
      (d) => (d.links = [{ sourceId: 'familytime', targetId: 'family', relation: 'support' }]),
    ],
    ['unknown comment target', (d) => (d.comments = [{ nodeId: 'nope', body: 'x' }])],
    ['option in argument mode', (d) => (d.mode = 'argument')],
    ['option under an option', (d) => (claims(d)[2]!.parentId = 'family')],
  ];
  for (const [label, mutate] of cases) {
    const build = () => {
      const d = sample();
      mutate(d);
      return d;
    };
    sameError(
      () => draftToProject(build(), clock('d')),
      () => withOracle(() => proto.draft.toProject(build(), proto.core), 'd'),
      label
    );
  }
});

test('draftSummary counts what the preview dialog lists', () => {
  const summary = draftSummary(parseAiDraft(sample()));
  assert.deepEqual(
    { ...summary, items: summary.items.slice(0, 2) },
    {
      title: 'Mitä tekisin lauantaina?',
      mode: 'decision',
      assessor: 'Esimerkki-AI',
      claims: 6,
      sharedReasons: 1,
      links: 0,
      comments: 1,
      credenceRatings: 3,
      influenceRatings: 3,
      items: [
        { title: 'Uimahalliin lasten kanssa', relation: 'option', credence: null, influence: null },
        { title: 'Voimme saada perheen yhteistä aikaa', relation: 'support', credence: 70, influence: 4 },
      ],
      more: 0,
    }
  );
  const big = sample();
  big.claims = Array.from({ length: 35 }, (_, i) => ({
    id: `c${i}`,
    parentId: 'root',
    relation: 'option',
    title: `V${i}`,
  }));
  big.sharedAttachments = [];
  assert.equal(draftSummary(parseAiDraft(big)).items.length, 30);
  assert.equal(draftSummary(parseAiDraft(big)).more, 5);
});
