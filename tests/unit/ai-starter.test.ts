/**
 * must: the legacy `witt-ai-starter-v1` port reproduces the prototype's `src/ai-starter.js` — the schema, the accepted
 *       and refused inputs with their messages, the argument-mode document with neutral placeholders and no ratings
 *       (same ids with the same counting source), and the unused-but-kept prompt in all nine languages
 * test: tests/unit/ai-starter.test.ts (the prototype module is the oracle)
 * red-against: a starter opened in decision mode, a placeholder confidence of 100 or impact of 3 instead of 50 / 0,
 *              a smuggled `confidence` or `votes` field accepted, a cycle accepted because the input order was lucky
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  STARTER_FORMAT,
  STARTER_SCHEMA,
  buildStarterPrompt,
  parseStarter,
  starterToProject,
} from '../../src/domain/index.ts';
import { clock, clone, proto, protoDir, readJson, sameError, withOracle } from './ai-oracle.ts';

const validDraft = () => ({
  format: STARTER_FORMAT,
  title: 'Must the city improve cycling?',
  root: {
    id: 'main',
    title: 'Should the city build protected cycle lanes?',
    details: 'Explore uncertainty, not a vote.',
  },
  claims: [
    { id: 'rebuttal', parentId: 'objection', relation: 'oppose', title: 'Safer crossings can mitigate this' },
    { id: 'objection', parentId: 'main', relation: 'oppose', title: 'Construction costs money' },
    {
      id: 'reason',
      parentId: 'main',
      relation: 'support',
      title: 'Separation may reduce conflicts',
      details: 'Evidence needed',
    },
  ],
});

test('STARTER_SCHEMA equals the prototype runtime schema and the shipped schema file', () => {
  assert.equal(JSON.stringify(STARTER_SCHEMA, null, 2), JSON.stringify(proto.starter.schema, null, 2));
  assert.deepEqual(STARTER_SCHEMA, readJson(path.join(protoDir, 'schemas', 'ai-starter.v1.schema.json')));
});

test('parseStarter accepts the prototype test draft identically and refuses the same inputs', () => {
  assert.deepEqual(parseStarter(validDraft()), proto.starter.validate(validDraft()));
  assert.deepEqual(
    parseStarter(JSON.stringify(validDraft())),
    proto.starter.validate(JSON.stringify(validDraft()))
  );
  const cases: [string, (d: ReturnType<typeof validDraft>) => void][] = [
    ['duplicate id', (d) => (d.claims[0]!.id = 'objection')],
    ['missing parent', (d) => (d.claims[1]!.parentId = 'unknown')],
    ['cycle', (d) => (d.claims[1]!.parentId = 'rebuttal')],
    [
      'too many',
      (d) =>
        (d.claims = Array.from({ length: 201 }, (_, i) => ({
          id: `c${i}`,
          parentId: 'main',
          relation: 'support',
          title: 'Claim',
        }))),
    ],
    ['proto id', (d) => (d.claims[0]!.id = '__proto__')],
    ['root confidence', (d) => ((d.root as Record<string, unknown>).confidence = 87)],
    ['claim impact', (d) => ((d.claims[0] as Record<string, unknown>).impact = 5)],
    ['votes', (d) => ((d as Record<string, unknown>).votes = [])],
    ['format', (d) => (d.format = 'witt-ai-draft-v2' as typeof STARTER_FORMAT)],
    ['relation', (d) => (d.claims[0]!.relation = 'neutral')],
    ['blank title', (d) => (d.title = ' ')],
    ['long details', (d) => (d.claims[2]!.details = 'x'.repeat(3001))],
  ];
  const seen = new Set<string>();
  for (const [label, mutate] of cases) {
    const build = () => {
      const d = validDraft();
      mutate(d);
      return d;
    };
    seen.add(
      sameError(
        () => parseStarter(build()),
        () => proto.starter.validate(build()),
        label
      )
    );
  }
  assert.ok(seen.has('Duplicate claim ID'));
  assert.ok(seen.has('Claim cycle or missing parent'));
  assert.ok(seen.has('At most 200 claims'));
  assert.ok(seen.has('starter: prohibited property votes'));
});

test('starterToProject builds the prototype document: argument mode, neutral placeholders, no ratings', () => {
  const ours = starterToProject(validDraft(), clock('s'));
  const theirs = withOracle(() => proto.starter.toProject(validDraft(), proto.core), 's');
  assert.deepEqual(clone(ours), clone(theirs));
  assert.equal(ours.mode, 'argument');
  assert.equal(ours.nodes.length, 4);
  assert.ok(ours.nodes.every((n) => n.confidence === 50 && n.impact === 0 && n.createdBy === 's-0001'));
  assert.deepEqual([ours.votes, ours.edgeAssessments, ours.ballots, ours.links], [[], [], [], []]);
  assert.equal(
    ours.nodes.find((n) => n.title === 'Safer crossings can mitigate this')!.parentId,
    ours.nodes.find((n) => n.title === 'Construction costs money')!.id
  );
});

test('buildStarterPrompt matches the prototype in every language and for an empty topic', () => {
  for (const lang of ['fi', 'de', 'en', 'es', 'fr', 'ru', 'zh-Hans', 'ja', 'ko', 'xx'])
    assert.equal(buildStarterPrompt(lang, 'Test topic'), proto.starter.buildPrompt(lang, 'Test topic'));
  assert.equal(buildStarterPrompt(), proto.starter.buildPrompt());
  assert.equal(buildStarterPrompt('fi', 'x'.repeat(2000)), proto.starter.buildPrompt('fi', 'x'.repeat(2000)));
});
