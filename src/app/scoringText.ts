// The texts and the menu order of the calculation methods the app offers. One row per offered version: a version
// without its row does not compile. The archived versions have no texts here (owner 2026-11-18); a document never
// reaches the screen with one, because the store opens it under the default (`withOfferedScoring`).
import { SCORING_ANCHORED, SCORING_DIRECT, SCORING_VERSION, isOfferedScoring } from '../domain/index.ts';
import type { OfferedScoring, ScoringVersion } from '../domain/index.ts';
import type { MessageKey } from '../lib/i18n/i18n.ts';

interface ScoringText {
  /** The option's label in Arviointi → Laskentatapa. */
  label: MessageKey;
  /** The paragraph under the selected node's "Mitä perustelutulos tarkoittaa?". */
  explain: MessageKey;
  /** One visible line under the select. */
  note: MessageKey;
}
const TEXTS: Record<OfferedScoring, ScoringText> = {
  [SCORING_ANCHORED]: {
    label: 'scoringAnchored',
    explain: 'indexExplainAnchored',
    note: 'scoringNoteAnchored',
  },
  [SCORING_DIRECT]: { label: 'scoringDirect', explain: 'indexExplainDirect', note: 'scoringNoteDirect' },
};
export const scoringText = (version: ScoringVersion): ScoringText =>
  TEXTS[isOfferedScoring(version) ? version : (SCORING_VERSION as OfferedScoring)];
