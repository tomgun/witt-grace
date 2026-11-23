// The home screen's example trees (owner 2026-11-20, S-15; reworked 2026-11-23): five argument trees from five
// walks of life, a decision tree and a risk tree. Every one has the same shape, a question or a goal, two branches
// under it, and under each branch its own reasons, so the card keeps its size while they take turns. A branch's
// reasons are about that branch, never about the question above it. All synthetic.
import type { MessageKey } from '../lib/i18n/catalog.ts';

/** How a card is coloured: for, against, or an option of a decision. */
export type ScenarioTone = 'supporting' | 'opposing' | 'option';
export interface ScenarioNode {
  /** The small capital label over the card: + PUOLTAA, − VASTUSTAA, VAIHTOEHTO, ! RISKI, TORJUNTA… */
  tag: MessageKey;
  tone: ScenarioTone;
  title: MessageKey;
}
export interface ScenarioBranch extends ScenarioNode {
  children: readonly ScenarioNode[];
}
export interface Scenario {
  label: MessageKey;
  root: MessageKey;
  branches: readonly [ScenarioBranch, ScenarioBranch];
}

const FOR = 'homeCanvasFor';
const AGAINST = 'homeCanvasAgainst';
/** An argument tree: a reason for with a reason for it, a reason against with a reason against that. */
const argument = (
  label: MessageKey,
  root: MessageKey,
  pro: MessageKey,
  proWhy: MessageKey,
  con: MessageKey,
  conWhy: MessageKey
): Scenario => ({
  label,
  root,
  branches: [
    { tag: FOR, tone: 'supporting', title: pro, children: [{ tag: FOR, tone: 'supporting', title: proWhy }] },
    {
      tag: AGAINST,
      tone: 'opposing',
      title: con,
      children: [{ tag: AGAINST, tone: 'opposing', title: conWhy }],
    },
  ],
});

export const SCENARIOS: readonly Scenario[] = [
  argument(
    'homeScenarioLabel1',
    'homeCanvasRoot',
    'homeCanvasForTitle',
    'homeCanvasForDetail',
    'homeCanvasAgainstTitle',
    'homeCanvasAgainstDetail'
  ),
  ...([2, 3, 4, 5] as const).map((n) =>
    argument(
      `homeScenarioLabel${n}`,
      `homeScenario${n}Root`,
      `homeScenario${n}For`,
      `homeScenario${n}ForDetail`,
      `homeScenario${n}Against`,
      `homeScenario${n}AgainstDetail`
    )
  ),
  // A decision: two options, each with a reason for it and one against it.
  {
    label: 'homeScenarioLabel6',
    root: 'homeDecisionRoot',
    branches: [
      {
        tag: 'homeTagOption',
        tone: 'option',
        title: 'homeDecisionA',
        children: [
          { tag: FOR, tone: 'supporting', title: 'homeDecisionAFor' },
          { tag: AGAINST, tone: 'opposing', title: 'homeDecisionAAgainst' },
        ],
      },
      {
        tag: 'homeTagOption',
        tone: 'option',
        title: 'homeDecisionB',
        children: [
          { tag: FOR, tone: 'supporting', title: 'homeDecisionBFor' },
          { tag: AGAINST, tone: 'opposing', title: 'homeDecisionBAgainst' },
        ],
      },
    ],
  },
  // Risks: the goal on top, a risk against it with what is done about it, and an action for it with why it helps.
  {
    label: 'homeScenarioLabel7',
    root: 'homeRiskRoot',
    branches: [
      {
        tag: 'homeTagRisk',
        tone: 'opposing',
        title: 'homeRiskRisk',
        children: [
          { tag: 'homeTagCause', tone: 'opposing', title: 'homeRiskCause' },
          { tag: 'homeTagMitigation', tone: 'supporting', title: 'homeRiskMitigation' },
        ],
      },
      {
        tag: 'homeTagAction',
        tone: 'supporting',
        title: 'homeRiskAction',
        children: [{ tag: FOR, tone: 'supporting', title: 'homeRiskActionWhy' }],
      },
    ],
  },
];

/** How long one example is shown before the next takes its turn. */
export const SCENARIO_TURN_MS = 10_000;
/** The example `step` places after (or before) `index`, around the ends. */
export const scenarioAfter = (index: number, step: number, count: number = SCENARIOS.length): number =>
  (((index + step) % count) + count) % count;
