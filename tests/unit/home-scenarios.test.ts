/**
 * must: the home screen's examples (owner 2026-11-20 and 2026-11-23, S-15) are seven trees of one shape: a question
 *       or a goal, two branches, one or two reasons under each branch; five argument trees, then a decision whose
 *       branches are options with a reason for and one against each, then risks (a risk with its cause and what is
 *       done about it, an action with why it helps); every text has a Finnish wording of its own and no text is
 *       used twice; in the argument examples a reason's own reason is for it in some and against it in others, on
 *       both sides (owner 2026-11-24); an example is shown for ten seconds; the arrows go round the ends
 * test: tests/unit/home-scenarios.test.ts
 * red-against: an example without a second branch (the card changes size as they take turns), a child text reused
 *              from another example, every sub-reason taking its parent's side (for under for, against under
 *              against), a label that does not match the card's colour, a decision example whose options are coloured as reasons, a turn of eight
 *              seconds, the previous arrow stopping at the first example
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { FI } from '../../src/lib/i18n/catalog.ts';
import { SCENARIOS, SCENARIO_TURN_MS, scenarioAfter } from '../../src/app/homeScenarios.ts';

const text = (key: string): string => (FI as Record<string, string>)[key] ?? '';

test('seven examples of one shape, every text worded and used once', () => {
  assert.equal(SCENARIOS.length, 7);
  const seen = new Set<string>();
  for (const scenario of SCENARIOS) {
    assert.equal(scenario.branches.length, 2);
    const titles = [
      scenario.root,
      ...scenario.branches.flatMap((branch) => [
        branch.title,
        ...branch.children.map((child) => child.title),
      ]),
    ];
    for (const branch of scenario.branches)
      assert.ok(branch.children.length >= 1 && branch.children.length <= 2);
    for (const key of [scenario.label, ...titles]) {
      assert.ok(text(key).length > 0, `${key} has a Finnish text`);
      assert.ok(!seen.has(key), `${key} is used once`);
      seen.add(key);
    }
  }
  assert.deepEqual(
    SCENARIOS.map((s) => text(s.label)),
    ['Yritys', 'Kunta', 'Urheiluseura', 'Koulu', 'Perhe', 'Päätös', 'Riskit']
  );
});

test('the family example: the reason under “Lapset oppivat vastuuta” is about that reason', () => {
  const family = SCENARIOS[4]!;
  assert.equal(text(family.branches[0].title), 'Lapset oppivat vastuuta');
  assert.deepEqual(
    family.branches[0].children.map((c) => text(c.title)),
    ['Hoitovuorot jaetaan lasten kesken']
  );
});

test('the decision example has two options with a reason for and one against each; the risks a risk and an action', () => {
  const decision = SCENARIOS[5]!;
  assert.deepEqual(
    decision.branches.map((b) => [b.tone, text(b.tag), text(b.title)]),
    [
      ['option', 'VAIHTOEHTO', 'Toimisto keskustassa'],
      ['option', 'VAIHTOEHTO', 'Etätyö ja pieni tila'],
    ]
  );
  for (const option of decision.branches)
    assert.deepEqual(
      option.children.map((c) => c.tone),
      ['supporting', 'opposing']
    );
  const risks = SCENARIOS[6]!;
  assert.deepEqual(
    risks.branches.map((b) => [b.tone, text(b.tag)]),
    [
      ['opposing', '! RISKI'],
      ['supporting', '+ TUKEVA TOIMI'],
    ]
  );
  assert.deepEqual(
    risks.branches[0].children.map((c) => [c.tone, text(c.tag)]),
    [
      ['opposing', 'SYY'],
      ['supporting', 'TORJUNTA'],
    ]
  );
});

test('ten seconds an example, and the arrows go round', () => {
  assert.equal(SCENARIO_TURN_MS, 10_000);
  assert.equal(scenarioAfter(0, 1), 1);
  assert.equal(scenarioAfter(6, 1), 0);
  assert.equal(scenarioAfter(0, -1), 6);
  assert.equal(scenarioAfter(3, -1), 2);
});

test('a reason’s reason speaks for or against it, and the argument examples show every pairing', () => {
  const pairs = SCENARIOS.slice(0, 5).map((s) =>
    s.branches.map((b) => `${b.tone}>${b.children[0]!.tone}`).join(' ')
  );
  assert.deepEqual(pairs, [
    'supporting>supporting opposing>opposing',
    'supporting>opposing opposing>supporting',
    'supporting>opposing opposing>opposing',
    'supporting>supporting opposing>supporting',
    'supporting>supporting opposing>opposing',
  ]);
  // The label says what the card does to the card above it.
  for (const scenario of SCENARIOS.slice(0, 5))
    for (const branch of scenario.branches)
      for (const child of branch.children)
        assert.equal(text(child.tag), child.tone === 'supporting' ? '+ PUOLTAA' : '− VASTUSTAA');
  const council = SCENARIOS[1]!;
  assert.deepEqual(
    council.branches.map((b) => [text(b.title), text(b.children[0]!.tag), text(b.children[0]!.title)]),
    [
      ['Lyhyet matkat sujuvat ilman autoa', '− VASTUSTAA', 'Talvella harva pyöräilee'],
      ['Pysäköintipaikkoja poistuu', '+ PUOLTAA', 'Autolla asioivat jäävät pois'],
    ]
  );
});
