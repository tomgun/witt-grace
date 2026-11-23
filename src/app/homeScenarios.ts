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
const child = (stance: 'for' | 'against', title: MessageKey): ScenarioNode =>
  stance === 'for' ? { tag: FOR, tone: 'supporting', title } : { tag: AGAINST, tone: 'opposing', title };
/**
 * An argument tree: a reason for the claim and a reason against it, each with a reason of its own. A reason's
 * reason speaks for or against that reason, and both happen (owner 2026-11-24): a reason for the claim can have
 * a reason against it, and a reason against the claim one that backs it up.
 */
const argument = (
  label: MessageKey,
  root: MessageKey,
  pro: MessageKey,
  proChild: ScenarioNode,
  con: MessageKey,
  conChild: ScenarioNode
): Scenario => ({
  label,
  root,
  branches: [
    { tag: FOR, tone: 'supporting', title: pro, children: [proChild] },
    { tag: AGAINST, tone: 'opposing', title: con, children: [conChild] },
  ],
});

export const SCENARIOS: readonly Scenario[] = [
  // Business: the reason for is backed up; the reason against is answered.
  argument(
    'homeScenarioLabel1',
    'homeCanvasRoot',
    'homeCanvasForTitle',
    child('for', 'homeCanvasForDetail'),
    'homeCanvasAgainstTitle',
    child('against', 'homeCanvasAgainstDetail')
  ),
  // Council: the reason for is questioned; the reason against is backed up.
  argument(
    'homeScenarioLabel2',
    'homeScenario2Root',
    'homeScenario2For',
    child('against', 'homeScenario2ForDetail'),
    'homeScenario2Against',
    child('for', 'homeScenario2AgainstDetail')
  ),
  // Sports club: both reasons are questioned.
  argument(
    'homeScenarioLabel3',
    'homeScenario3Root',
    'homeScenario3For',
    child('against', 'homeScenario3ForDetail'),
    'homeScenario3Against',
    child('against', 'homeScenario3AgainstDetail')
  ),
  // School: both reasons are backed up.
  argument(
    'homeScenarioLabel4',
    'homeScenario4Root',
    'homeScenario4For',
    child('for', 'homeScenario4ForDetail'),
    'homeScenario4Against',
    child('for', 'homeScenario4AgainstDetail')
  ),
  // Family: the reason for is backed up; the reason against is answered.
  argument(
    'homeScenarioLabel5',
    'homeScenario5Root',
    'homeScenario5For',
    child('for', 'homeScenario5ForDetail'),
    'homeScenario5Against',
    child('against', 'homeScenario5AgainstDetail')
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
