// The v8 WITT document: types, closed sets and the predicates every other domain module shares.
// Numbers here are the GRACE contract (docs/spec/GRACE_AND_DATA_MODEL.md); change them only with a new scoring version.

export const SCHEMA_VERSION = 8 as const;
/** The prototype's scoring: a claim's own credence is its base and its reasons move it (kept for the prototype's files). */
export const SCORING_V3 = 'evidence-v3-links' as const;
/** Owner decision 2026-11-09: a claim with reasons gets its result from them alone, starting neutral; its own credence
 * is then a felt sense that never enters the score. Leaves keep their own credence. */
export const SCORING_V4 = 'evidence-v4-reasons' as const;
/** Owner request 2026-11-09: reasons decide as in v4, but evidence adds up as log-odds, so it never hits a hard cap: a
 * claim's internal value is 100·σ(logit(base) + k·(positive − negative)), k = ln 3 / 5, so one fully credible +5
 * reason still gives 75 (+50) from a neutral base, two give 90 (+80) instead of the capped 100. */
export const SCORING_LOGODDS = 'logodds-reasons-v1' as const;
export const SCORING_VERSIONS = [SCORING_V3, SCORING_V4, SCORING_LOGODDS] as const;
export type ScoringVersion = (typeof SCORING_VERSIONS)[number];
/** The version a new document gets. */
export const SCORING_VERSION: ScoringVersion = SCORING_V4;

export const MODES = ['argument', 'decision'] as const;
export const THEMES = ['light', 'dark', 'paper'] as const;
export const KINDS = ['claim', 'option', 'decision', 'group'] as const;
export const STANCES = ['root', 'support', 'oppose', 'neutral', 'option', 'group'] as const;
export const SEMANTIC_TYPES = [
  'unspecified',
  'fact',
  'value',
  'assumption',
  'constraint',
  'prerequisite',
] as const;
export const GATE_STATUSES = ['unknown', 'met', 'unmet'] as const;
export const ROLES = ['owner', 'editor', 'viewer'] as const;
export const VOTE_WEIGHTINGS = ['equal', 'shares'] as const;
export const ASSESSMENT_WEIGHTINGS = ['structural', 'equal', 'shares'] as const;
export const PROFILE_KINDS = ['human', 'ai'] as const;
export const AUDIT_ACTIONS = ['open', 'cast', 'update', 'retract', 'close'] as const;

export type Mode = (typeof MODES)[number];
export type Theme = (typeof THEMES)[number];
export type Kind = (typeof KINDS)[number];
export type Stance = (typeof STANCES)[number];
export type SemanticType = (typeof SEMANTIC_TYPES)[number];
export type GateStatus = (typeof GATE_STATUSES)[number];
export type Role = (typeof ROLES)[number];
export type VoteWeighting = (typeof VOTE_WEIGHTINGS)[number];
export type AssessmentWeighting = (typeof ASSESSMENT_WEIGHTINGS)[number];
export type ProfileKind = (typeof PROFILE_KINDS)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type LinkRelation = 'support' | 'oppose';
export type SubjectType = 'primary' | 'secondary';

export interface User {
  id: string;
  name: string;
  shares: number;
  role: Role;
  profileKind?: ProfileKind;
}
export interface SourceRef {
  url: string;
  note: string;
}
export interface Position {
  x: number;
  y: number;
}
export interface Node {
  id: string;
  parentId: string | null;
  relation: Stance;
  kind: Kind;
  title: string;
  details: string;
  /** Authored template credence 0..100; a human review lives in `votes`, never here. */
  confidence: number;
  /** Authored unsigned influence magnitude 0..5; the sign is `relation`. */
  impact: number;
  collapsed: boolean;
  position: Position;
  createdBy: string;
  lastEditedBy?: string;
  semanticType?: SemanticType;
  constraintStatus?: GateStatus;
  sources?: SourceRef[];
  authorVisibility?: 'named' | 'anonymous';
  sharedReasonId?: string;
  reasonConceptId?: string;
  /** The person's own name for the node's type ("Kriteeri", "Tavoite"…), shown instead of the built-in root, option or
   * group tag, or of the semantic chip on a reason. Display only; never read by scoring (owner 2026-11-09). */
  typeLabel?: string;
  /** Owner 2026-11-10: a note or a plain fact that is not rated. It has no credence or influence sliders, never scores
   * into its parent and never makes it incomplete; reviews given earlier are kept and count again when it is switched
   * back. A new neutral reason starts unrated. */
  unrated?: true;
  /** Owner 2026-11-10: the influence slider of this relation moves in 0.1 steps instead of 0.5. Display only; the
   * data accepts 0.1 steps everywhere. */
  fineInfluence?: true;
}
export const TYPE_LABEL_MAX = 40;
export interface SharedReason {
  id: string;
  title: string;
  confidence: number;
  influence: number;
}
export interface ReasonConcept {
  id: string;
  title: string;
  semanticType: 'fact' | 'assumption' | 'value';
}
export interface Vote {
  id: string;
  nodeId: string;
  userId: string;
  confidence: number;
  updatedAt: string;
}
export interface EdgeAssessment {
  id: string;
  userId: string;
  subjectType: SubjectType;
  subjectId: string;
  influence: number;
  fingerprint: string;
  updatedAt: string;
}
export interface Ballot {
  id: string;
  optionId: string;
  userId: string;
  preference: number;
  updatedAt: string;
}
export interface VotingRound {
  id: string;
  status: 'open' | 'closed';
  anonymous: boolean;
  hideResults: boolean;
  weighting: VoteWeighting;
  weightByUser: Record<string, number>;
  optionIds: string[];
  openedAt: string;
  closedAt: string | null;
}
export interface VoteAuditEntry {
  id: string;
  roundId: string;
  action: AuditAction;
  userId: string;
  at: string;
  optionId?: string;
}
export interface VoteHistoryEntry {
  round: VotingRound;
  ballots: Ballot[];
  audit: VoteAuditEntry[];
  titleByOption: Record<string, string>;
}
export interface Comment {
  id: string;
  nodeId: string;
  body: string;
  authorName: string;
  authorId?: string;
  createdAt: string;
}
export interface Link {
  id: string;
  sourceId: string;
  targetId: string;
  relation: LinkRelation;
  impact: number;
  createdBy?: string;
}
export interface Layout {
  fourWayOffsets: Record<string, Position>;
}
export interface Settings {
  voteWeighting: VoteWeighting;
  assessmentWeighting: AssessmentWeighting;
  shareSnapshotDate: string | null;
  scoring: ScoringVersion;
  showAuthors: boolean;
}
export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  mode: Mode;
  theme: Theme;
  settings: Settings;
  users: User[];
  nodes: Node[];
  sharedReasons?: SharedReason[];
  reasonConcepts?: ReasonConcept[];
  votes: Vote[];
  edgeAssessments: EdgeAssessment[];
  ballots: Ballot[];
  votingRound: VotingRound | null;
  voteAudit: VoteAuditEntry[];
  voteHistory: VoteHistoryEntry[];
  comments: Comment[];
  links: Link[];
  layout: Layout;
  createdAt: string;
  updatedAt: string;
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
/** Public signed balance −100..+100 from the internal 0..100 score; null stays null (missing is not zero). */
export const argumentBalance = (internal: number | null): number | null =>
  internal !== null && Number.isFinite(internal) ? clamp(2 * internal - 100, -100, 100) : null;
export const evidenceFactor = (score: number): number => clamp(score / 100, 0, 1);
export const evidenceScore = (base: number, positive: number, negative: number): number =>
  clamp(base + 5 * (positive - negative), 0, 100);
const LOGODDS_K = Math.log(3) / 5;
/** The log-odds combination: no net evidence leaves the base as it is; otherwise the base (kept off 0 and 100) moves
 * on the logit scale. */
export const logOddsScore = (base: number, positive: number, negative: number): number => {
  const net = positive - negative;
  if (Math.abs(net) < 1e-12) return base;
  const p = clamp(base, 0.5, 99.5) / 100;
  return 100 / (1 + Math.exp(-(Math.log(p / (1 - p)) + LOGODDS_K * net)));
};
/** The score formula of a scoring version. */
export const scoreFor = (scoring: ScoringVersion) =>
  scoring === SCORING_LOGODDS ? logOddsScore : evidenceScore;

export const isGate = (n: Node | undefined | null): boolean =>
  n?.semanticType === 'constraint' || n?.semanticType === 'prerequisite';
export const isValue = (n: Node | undefined | null): boolean => n?.semanticType === 'value';
export const isUnrated = (n: Node | undefined | null): boolean => n?.unrated === true;
/** Gates, values and unrated notes never score into their parent as reasons. */
export const outOfScore = (n: Node | undefined | null): boolean => isGate(n) || isValue(n) || isUnrated(n);
export const truthAssessable = (n: Node | undefined | null): boolean =>
  !!n && n.kind === 'claim' && !isGate(n) && !isValue(n) && !isUnrated(n);
export const indexAssessable = (n: Node | undefined | null): boolean =>
  !!n && (n.kind === 'option' || truthAssessable(n));
export const assessmentFields = (node: Node | undefined | null): { credence: boolean; impact: boolean } => ({
  credence: truthAssessable(node),
  impact: node?.kind === 'claim' && !!node.parentId && !isGate(node) && !isUnrated(node),
});
export const isAiProfile = (user: User | undefined | null): boolean => user?.profileKind === 'ai';
/** Owner 2026-11-10: a signed influence is −5…+5 in 0.1 steps (the prototype's 0.5 steps are a subset); the UI moves in
 * 0.5 steps unless the relation asks for the fine scale. */
export const INFLUENCE_STEP = 0.1;
export const INFLUENCE_STEP_COARSE = 0.5;
export const isInfluenceStep = (value: number): boolean =>
  Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;
/** Removes the floating-point noise of a 0.1-step value (0.30000000000000004 → 0.3). */
export const roundInfluence = (value: number): number => Math.round(value * 10) / 10;
export const signedLinkImpact = (link: Link): number =>
  link.relation === 'oppose' ? -link.impact : link.impact;
export const signedInfluence = (node: Node): number | null => {
  if (node.parentId === null || node.relation === 'option' || node.relation === 'group') return null;
  return node.relation === 'neutral' ? 0 : node.relation === 'oppose' ? -node.impact : node.impact;
};
/** The authored +/- is a template; the displayed stance follows the chosen assessment. */
export const directionFromInfluence = (
  influence: number | null,
  initialRelation: Stance = 'neutral'
): Stance => {
  if (influence === null || !Number.isFinite(influence)) return initialRelation;
  return influence > 0 ? 'support' : influence < 0 ? 'oppose' : 'neutral';
};
/** A relation review is current only while source, target, their titles and the relation are unchanged. */
export const relationFingerprint = (source: Node, target: Node, relation: string): string =>
  JSON.stringify([source.id, target.id, source.title, target.title, relation]);

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
