/**
 * must: the import preflight reproduces the prototype's `src/import-validation.js` report exactly — format
 *       classification, every issue (code, JSON path, Finnish message and fix, syntax line and column), the issue
 *       order and caps, the stale-proposal checks against the open document, and the copyable report text — for every
 *       example, draft, proposal, starter, library backup and malformed input the prototype's own tests use
 * test: tests/unit/ai-import-report.test.ts (the prototype module is the oracle)
 * red-against: a schema key reordered (issue order changes), a graph check skipped so the parser's Finnish refusal
 *              replaces the precise path, a stale proposal passing because the fingerprint was taken over the raw
 *              document, a draft reported valid although `toProject` would refuse it, the input mutated by the walk
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  CONTRIBUTION_EXAMPLE,
  IMPORT_FORMAT_NAMES,
  createBlankProject,
  importFormatOf,
  importReportText,
  inspectImport,
  projectFingerprint,
} from '../../src/domain/index.ts';
import type { ImportReport, InspectOptions, Project } from '../../src/domain/index.ts';
import {
  FIXED,
  clone,
  draftFiles,
  exampleProjects,
  proto,
  protoDeps,
  protoDir,
  readJson,
} from './ai-oracle.ts';

const Import = proto.importValidation;
type Raw = Record<string, unknown>;
const sample = () => clone(draftFiles()[0]!.raw);
const blank = (mode: 'argument' | 'decision' = 'argument'): Project =>
  createBlankProject({ mode, projectId: 'p-1', rootId: 'r-1', userId: 'u-1', now: FIXED });

/** Both reports, with the report text, must be identical. */
function same(input: unknown, opts: InspectOptions = {}, label = ''): ImportReport {
  const ours = inspectImport(input, opts);
  const theirs = Import.inspect(input, protoDeps, opts);
  assert.deepEqual(clone(ours), clone(theirs), label || JSON.stringify(input).slice(0, 80));
  assert.equal(
    importReportText(ours, 'tiedosto.json'),
    Import.reportText(theirs, 'tiedosto.json'),
    `${label} text`
  );
  assert.equal(importReportText(ours), Import.reportText(theirs), `${label} text without filename`);
  return ours;
}
const has = (report: ImportReport, p: string, code?: string) =>
  report.issues.some((e) => e.path === p && (!code || e.code === code));

test('the project schema used by the preflight is the prototype module and the shipped v8 schema file', () => {
  assert.deepEqual(IMPORT_FORMAT_NAMES, {
    project: 'WITT-dokumentti v5',
    draft: 'AI:n arvioitu puu v2',
    contribution: 'WITT-/AI-muutosehdotus v2',
    starter: 'Vanha AI-runko v1',
    library: 'Asiakirjakirjaston varmuuskopio',
  });
  assert.deepEqual(readJson(path.join(protoDir, 'schemas', 'project.v8.schema.json')), proto.projectSchema);
});

test('every example project and draft file passes identically, as an object and as JSON text', () => {
  for (const { name, raw } of exampleProjects()) {
    const report = same(raw, {}, name);
    assert.equal(report.ok, true, JSON.stringify(report.issues));
    assert.equal(report.format, 'project');
    same(JSON.stringify(raw, null, 2), {}, `${name} text`);
    same(raw, { expected: 'project' }, `${name} expected project`);
    same(raw, { expected: 'draft' }, `${name} expected draft`);
  }
  for (const { name, raw } of draftFiles()) {
    const report = same(raw, {}, name);
    assert.equal(report.ok, true, JSON.stringify(report.issues));
    assert.equal(report.format, 'draft');
    same(JSON.stringify(raw), { expected: 'draft' }, `${name} text`);
  }
  assert.equal(importFormatOf(sample()), 'draft');
  assert.equal(importFormatOf(blank()), 'project');
  assert.equal(importFormatOf([]), 'unknown');
});

test('several independent draft errors get accurate paths and the same order and caps as the prototype', () => {
  const doc = sample();
  const claims = doc.claims as Raw[];
  claims[0]!.credence = 135;
  claims[0]!.influence = 1.3;
  delete claims[1]!.parentId;
  claims[2]!.relation = 'helps';
  claims[3]!.surprise = true;
  const report = same(JSON.stringify(doc), {}, 'several errors');
  assert.equal(report.ok, false);
  assert.ok(has(report, '$.claims[0].credence', 'MAXIMUM'));
  assert.ok(has(report, '$.claims[0].influence', 'STEP'));
  assert.ok(has(report, '$.claims[1].parentId', 'REQUIRED'));
  assert.ok(has(report, '$.claims[2].relation', 'ENUM'));
  assert.ok(has(report, '$.claims[3].surprise', 'UNKNOWN_FIELD'));
  assert.match(importReportText(report, 'draft.json'), /Korjaa:/);
  const many = sample();
  many.claims = Array.from({ length: 80 }, (_, i) => ({
    id: `c${i}`,
    parentId: 'root',
    relation: 'support',
    title: 'x',
    credence: 500,
  }));
  many.sharedAttachments = [];
  assert.equal(
    same(many, {}, 'capped').issues.length,
    60,
    'the schema walk is capped by maxErrors (default 60)'
  );
  assert.equal(same(many, { maxErrors: 10 }, 'capped at 10').issues.length, 10);
  const typed = sample();
  typed.claims = 'none';
  typed.root = 5;
  typed.title = 3;
  same(typed, {}, 'type errors');
  const texts = sample();
  texts.title = '';
  texts.assessor = 'a'.repeat(80);
  (texts.root as Raw).id = '9bad';
  (texts.sharedReasons as Raw[])[0]!.influence = 9;
  same(texts, {}, 'text and range errors');
});

test('JSON syntax errors carry line and column; Markdown fences and non-object roots are named', () => {
  const raw = '{\n  "format": "witt-ai-draft-v2",\n  "claims": [1,],\n}';
  const report = same(raw, {}, 'syntax');
  assert.equal(report.issues[0]!.code, 'JSON_SYNTAX');
  assert.ok((report.issues[0]!.line ?? 0) >= 3);
  assert.ok((report.issues[0]!.column ?? 0) >= 1);
  assert.match(importReportText(report), /rivi [0-9]+, sarake [0-9]+/);
  same('{"a": 1', {}, 'unexpected end');
  same('{"a": tru}', {}, 'bad token');
  same('', {}, 'empty');
  const fenced = same('```json\n' + JSON.stringify(sample()) + '\n```', {}, 'markdown');
  assert.equal(fenced.issues[0]!.code, 'MARKDOWN');
  assert.match(fenced.issues[0]!.fix, /```/);
  assert.equal(same('[1,2]', {}, 'array root').issues[0]!.code, 'ROOT_TYPE');
  assert.equal(same('null', {}, 'null root').issues[0]!.code, 'ROOT_TYPE');
  assert.equal(same(42, {}, 'number').issues[0]!.code, 'ROOT_TYPE');
  assert.equal(same('x'.repeat(30), { maxBytes: 10 }, 'too large').issues[0]!.code, 'TOO_LARGE');
});

test('draft graph checks: dangling parents, links, comments, attachments, collisions, cycles and non-factual ratings', () => {
  const draft = sample();
  const claims = draft.claims as Raw[];
  claims[1]!.id = claims[0]!.id;
  claims[2]!.parentId = 'missing';
  draft.links = [{ sourceId: 'ghost', targetId: 'root', relation: 'support' }];
  draft.comments = [{ nodeId: 'ghost', body: 'A comment' }];
  draft.sharedAttachments = [{ parentId: 'ghost', reasonId: 'missing' }];
  const r = same(draft, {}, 'dangling');
  assert.equal(r.ok, false);
  assert.ok(has(r, '$.claims[1].id', 'DUPLICATE_ID'));
  assert.ok(has(r, '$.claims[2].parentId', 'MISSING_PARENT'));
  assert.ok(has(r, '$.links[0].sourceId', 'MISSING_LINK_ENDPOINT'));
  assert.ok(has(r, '$.comments[0].nodeId', 'MISSING_COMMENT_NODE'));
  assert.ok(has(r, '$.sharedAttachments[0].reasonId', 'MISSING_SHARED_REASON'));
  assert.ok(has(r, '$.sharedAttachments[0].parentId', 'MISSING_PARENT'));
  const rated = sample();
  (rated.root as Raw).credence = 70;
  const option = (rated.claims as Raw[]).find((n) => n.relation === 'option')!;
  option.credence = 90;
  option.influence = 3;
  (rated.claims as Raw[]).find((n) => n.credence !== undefined && n.relation !== 'option')!.semanticType =
    'value';
  const r2 = same(rated, {}, 'non-factual');
  assert.ok(has(r2, '$.root.credence', 'DECISION_CREDENCE'));
  assert.ok(r2.issues.some((i) => i.code === 'NON_FACTUAL_CREDENCE'));
  assert.ok(r2.issues.some((i) => i.code === 'OPTION_INFLUENCE'));
  const cyclic = sample();
  (cyclic.claims as Raw[])[1]!.parentId = (cyclic.claims as Raw[])[3]!.id;
  (cyclic.claims as Raw[])[3]!.parentId = (cyclic.claims as Raw[])[1]!.id;
  assert.ok(same(cyclic, {}, 'cycle').issues.some((i) => i.code === 'CYCLE'));
  const misplaced = sample();
  (misplaced.claims as Raw[])[2]!.parentId = 'family';
  assert.ok(has(same(misplaced, {}, 'option parent'), '$.claims[2].relation', 'OPTION_PARENT'));
  const argued = sample();
  argued.mode = 'argument';
  same(argued, {}, 'options in argument mode');
  const domain = sample();
  domain.links = [{ sourceId: 'familytime', targetId: 'family', relation: 'support' }];
  const r3 = same(domain, {}, 'domain refusal');
  assert.deepEqual(
    r3.issues.map((i) => [i.code, i.path]),
    [['DOMAIN', '$']],
    'a draft the schema and graph checks accept but toProject refuses is reported by the parser'
  );
});

test('wrong import route, foreign and stale proposals, bundles and old document versions', () => {
  const r = same(sample(), { expected: 'project' }, 'wrong route');
  assert.equal(r.ok, false);
  assert.ok(has(r, '$.format', 'WRONG_IMPORT'));
  same(blank(), { expected: 'draft' }, 'project to draft route');
  const p = blank();
  const proposed: Raw = {
    ...clone(CONTRIBUTION_EXAMPLE),
    projectId: p.id,
    baseFingerprint: projectFingerprint(p),
    author: { kind: 'human', name: 'Tero' },
    claims: [{ tempId: 'new1', parentId: p.nodes[0]!.id, relation: 'support', title: 'Uusi peruste' }],
  };
  const ok = same(proposed, { expected: 'contribution', currentProject: p }, 'human proposal');
  assert.equal(ok.ok, true, JSON.stringify(ok.issues));
  assert.equal((ok.parsed as Raw).author, proposed.author);
  (proposed.assessments as Raw[])[0]!.credence = 222;
  assert.ok(
    has(
      same(proposed, { expected: 'contribution', currentProject: p }, 'bad credence'),
      '$.assessments[0].credence',
      'MAXIMUM'
    )
  );
  (proposed.assessments as Raw[])[0]!.credence = 70;
  proposed.baseFingerprint = '0000000000000000';
  assert.ok(has(same(proposed, { currentProject: p }, 'stale'), '$.baseFingerprint', 'STALE_PROPOSAL'));
  proposed.baseFingerprint = projectFingerprint(p);
  proposed.projectId = 'other';
  assert.ok(has(same(proposed, { currentProject: p }, 'foreign'), '$.projectId', 'WRONG_PROJECT'));
  proposed.projectId = p.id;
  proposed.assessments = [{ nodeId: 'new1' }];
  assert.ok(has(same(proposed, { currentProject: p }, 'anyOf'), '$.assessments[0]', 'ANY_OF'));
  proposed.assessments = [];
  proposed.claims = [];
  proposed.comments = [];
  assert.ok(same(proposed, { currentProject: p }, 'empty proposal').issues.some((i) => i.code === 'DOMAIN'));
  const bundle: Raw = {
    format: 'witt-contribution-bundle-v1',
    projectId: p.id,
    baseFingerprint: projectFingerprint(p),
    contributors: [
      {
        sourceUserId: 'u-1',
        kind: 'human',
        name: 'Tero',
        patch: {
          ...clone(CONTRIBUTION_EXAMPLE),
          projectId: p.id,
          baseFingerprint: projectFingerprint(p),
          author: { kind: 'human', name: 'Tero' },
          claims: [{ tempId: 'new1', parentId: p.nodes[0]!.id, relation: 'support', title: 'Uusi peruste' }],
        },
      },
    ],
    unattributedEdits: [],
    unattributedLinks: 0,
    unattributedComments: 0,
  };
  assert.equal(same(bundle, { expected: 'contribution', currentProject: p }, 'bundle').ok, true);
  bundle.unattributedLinks = -1;
  assert.ok(has(same(bundle, { currentProject: p }, 'bad bundle count'), '$.unattributedLinks', 'MINIMUM'));
  bundle.unattributedLinks = 0;
  (bundle.contributors as Raw[])[0]!.kind = 'ai';
  assert.ok(same(bundle, { currentProject: p }, 'ai contributor').issues.some((i) => i.code === 'DOMAIN'));
  const old = blank() as unknown as Raw;
  old.schemaVersion = 4;
  const version = same(old, {}, 'old version');
  assert.ok(has(version, '$.schemaVersion', 'VERSION'));
  assert.equal(version.issues.length, 1);
  same({ schemaVersion: 8 }, {}, 'bare project');
  const ownerless = blank();
  ownerless.users[0]!.role = 'editor';
  assert.ok(same(ownerless, {}, 'ownerless').issues.some((i) => i.code === 'DOMAIN'));
  const broken = blank() as unknown as Raw;
  broken.nodes = [
    { ...(blank().nodes[0] as unknown as Raw) },
    {
      ...(blank().nodes[0] as unknown as Raw),
      id: 'r-1',
      parentId: 'nowhere',
      relation: 'support',
      createdBy: 'nobody',
    },
  ];
  broken.votes = [{ id: 'v', nodeId: 'ghost', userId: 'u-1', confidence: 50, updatedAt: FIXED }];
  broken.edgeAssessments = [
    {
      id: 'e',
      userId: 'u-1',
      subjectType: 'primary',
      subjectId: 'ghost',
      influence: 1,
      fingerprint: 'f',
      updatedAt: FIXED,
    },
    {
      id: 'e2',
      userId: 'u-1',
      subjectType: 'secondary',
      subjectId: 'ghost',
      influence: 1,
      fingerprint: 'f',
      updatedAt: FIXED,
    },
  ];
  const graph = same(broken, {}, 'project graph');
  assert.ok(has(graph, '$.nodes[1].id', 'DUPLICATE_ID'));
  assert.ok(has(graph, '$.nodes[1].parentId', 'MISSING_PARENT'));
  assert.ok(has(graph, '$.nodes[1].createdBy', 'MISSING_AUTHOR'));
  assert.ok(has(graph, '$.votes[0].nodeId', 'MISSING_TARGET'));
  assert.ok(has(graph, '$.edgeAssessments[0].subjectId', 'MISSING_TARGET'));
  assert.ok(!has(graph, '$.edgeAssessments[1].subjectId'));
});

test('library backups are validated document by document; starters, requests and obsolete formats are classified', () => {
  const good = blank();
  const bad = clone(good);
  bad.nodes[0]!.confidence = 150;
  const r = same(
    { format: 'witt-document-library-v1', exportedAt: '2026-11-07', documents: [good, bad] },
    { expected: 'library' },
    'library'
  );
  assert.ok(has(r, '$.documents[1].nodes[0].confidence', 'MAXIMUM'));
  const yes = same(
    { format: 'witt-document-library-v1', documents: [good] },
    { expected: 'library' },
    'good library'
  );
  assert.equal(yes.ok, true, JSON.stringify(yes.issues));
  assert.ok(
    has(
      same({ format: 'witt-document-library-v1' }, { expected: 'library' }, 'no documents'),
      '$.documents',
      'REQUIRED'
    )
  );
  assert.ok(
    has(
      same(
        { format: 'witt-document-library-v1', documents: Array.from({ length: 1001 }, () => ({})) },
        {},
        'too many documents'
      ),
      '$.documents',
      'MAX_ITEMS'
    )
  );
  const ownerless = clone(good);
  ownerless.users[0]!.role = 'viewer';
  assert.ok(
    same({ format: 'witt-document-library-v1', documents: [ownerless] }, {}, 'library domain').issues.some(
      (i) => i.code === 'DOMAIN'
    )
  );
  const starter = {
    format: 'witt-ai-starter-v1',
    title: 'Cycling',
    root: { id: 'main', title: 'Build lanes?' },
    claims: [{ id: 'a', parentId: 'main', relation: 'support', title: 'Safer' }],
  };
  const s = same(starter, {}, 'starter');
  assert.deepEqual([s.ok, s.format, s.formatName], [true, 'starter', 'Vanha AI-runko v1']);
  same(starter, { expected: 'draft' }, 'starter to draft route');
  const cyclic = {
    ...starter,
    claims: [
      { id: 'a', parentId: 'b', relation: 'support', title: 'x' },
      { id: 'b', parentId: 'a', relation: 'oppose', title: 'y' },
    ],
  };
  assert.ok(same(cyclic, {}, 'starter cycle').issues.some((i) => i.code === 'DOMAIN'));
  const smuggled = { ...starter, claims: [{ ...starter.claims[0], impact: 5 }] };
  assert.ok(has(same(smuggled, {}, 'starter extra field'), '$.claims[0].impact', 'UNKNOWN_FIELD'));
  const request = same({ format: 'witt-contribution-request-v2', projectId: '123' }, {}, 'request');
  assert.equal(request.issues[0]!.code, 'REQUEST_NOT_RESPONSE');
  assert.equal(
    same({ format: 'witt-ai-review-request-v1' }, {}, 'v1 request').issues[0]!.code,
    'REQUEST_NOT_RESPONSE'
  );
  assert.equal(
    same({ format: 'witt-ai-review-v1', projectId: 'x' }, {}, 'obsolete').issues[0]!.code,
    'OBSOLETE_FORMAT'
  );
  const unknown = same({ format: 'something-else' }, { expected: 'draft' }, 'unknown with route');
  assert.deepEqual(
    unknown.issues.map((i) => [i.code, i.path]),
    [
      ['FORMAT', '$.format'],
      ['WRONG_IMPORT', '$.format'],
    ]
  );
  assert.deepEqual(
    same({ hello: 1 }, {}, 'no format').issues.map((i) => [i.code, i.path]),
    [['FORMAT', '$']]
  );
  assert.deepEqual(
    same({ hello: 1 }, { expected: 'project' }, 'no format, project route').issues.map((i) => [
      i.code,
      i.path,
    ]),
    [
      ['FORMAT', '$'],
      ['WRONG_IMPORT', '$.schemaVersion'],
    ]
  );
});

test('the walk never mutates the input or the open document, and the report text is the prototype text', () => {
  const active = blank('argument');
  const source = sample();
  (source.claims as Raw[])[0]!.credence = 150;
  const beforeSource = JSON.stringify(source);
  const beforeActive = JSON.stringify(active);
  const report = inspectImport(source, { currentProject: active });
  assert.equal(report.ok, false);
  assert.equal(JSON.stringify(source), beforeSource);
  assert.equal(JSON.stringify(active), beforeActive);
  assert.equal(
    importReportText(report, 'vastaus.json'),
    [
      'WITT JSON -tarkistusraportti',
      'Tiedosto: vastaus.json',
      'Muoto: AI:n arvioitu puu v2',
      'Tulos: hylätty (2 virhettä)',
      '',
      '1. [MAXIMUM] $.claims[0].credence',
      'Arvo 150 on liian suuri.',
      'Korjaa: Suurin sallittu arvo on 100.',
      '',
      '2. [NON_FACTUAL_CREDENCE] $.claims[0].credence',
      'Tähän solmutyyppiin ei kuulu uskottavuusprosenttia.',
      'Korjaa: Poista credence-kenttä; suhteelle voi jäädä vaikutusarvio.',
      '',
    ].join('\n')
  );
  const accepted = inspectImport(sample());
  assert.equal(
    importReportText(accepted),
    [
      'WITT JSON -tarkistusraportti',
      'Muoto: AI:n arvioitu puu v2',
      'Tulos: hyväksytty',
      '',
      'JSON on tarkistettu skeeman ja nykyisen WITT-tietomallin perusteella.',
    ].join('\n')
  );
});
