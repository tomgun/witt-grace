// The texts and the menu order of the calculation methods. One row per scoring version: a version without its row
// does not compile, so a new method can never fall through to another method's label or explanation.
import {
  SCORING_ANCHORED,
  SCORING_CHAIN,
  SCORING_DIRECT,
  SCORING_LOGODDS,
  SCORING_SIGNED,
  SCORING_V3,
  SCORING_V4,
} from '../domain/index.ts';
import type { ScoringVersion } from '../domain/index.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';

interface ScoringText {
  /** The option's label in Arviointi → Laskentatapa. */
  label: MessageKey;
  /** The paragraph under the selected node's "Mitä perustelutulos tarkoittaa?". */
  explain: MessageKey;
  /** One visible line under the select; the earlier methods have none. */
  note: MessageKey | null;
}
export const SCORING_TEXT: Record<ScoringVersion, ScoringText> = {
  [SCORING_ANCHORED]: {
    label: 'scoringAnchored',
    explain: 'indexExplainAnchored',
    note: 'scoringNoteAnchored',
  },
  [SCORING_DIRECT]: { label: 'scoringDirect', explain: 'indexExplainDirect', note: 'scoringNoteDirect' },
  [SCORING_V4]: { label: 'scoringReasons', explain: 'indexExplainReasons', note: null },
  [SCORING_LOGODDS]: { label: 'scoringLogOdds', explain: 'indexExplainLogOdds', note: null },
  [SCORING_SIGNED]: { label: 'scoringSigned', explain: 'indexExplainSigned', note: null },
  [SCORING_CHAIN]: { label: 'scoringChain', explain: 'indexExplainChain', note: null },
  [SCORING_V3]: { label: 'scoringPrototype', explain: 'indexExplain', note: null },
};
/** The methods offered first, and the earlier ones under the group "Vanhat" (owner 2026-11-18). */
export const SCORING_CURRENT: readonly ScoringVersion[] = [SCORING_ANCHORED, SCORING_DIRECT];
export const SCORING_EARLIER: readonly ScoringVersion[] = [
  SCORING_V4,
  SCORING_LOGODDS,
  SCORING_SIGNED,
  SCORING_CHAIN,
  SCORING_V3,
];
