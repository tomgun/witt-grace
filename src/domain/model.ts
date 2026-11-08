// The v8 WITT document: types, closed sets and the predicates every other domain module shares.
// Numbers here are the GRACE contract (docs/spec/GRACE_AND_DATA_MODEL.md); change them only with a new scoring version.

export const SCHEMA_VERSION = 8 as const;
export const SCORING_VERSION = 'evidence-v3-links' as const;

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
}
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
  scoring: typeof SCORING_VERSION;
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

export const isGate = (n: Node | undefined | null): boolean =>
  n?.semanticType === 'constraint' || n?.semanticType === 'prerequisite';
export const isValue = (n: Node | undefined | null): boolean => n?.semanticType === 'value';
export const truthAssessable = (n: Node | undefined | null): boolean =>
  !!n && n.kind === 'claim' && !isGate(n) && !isValue(n);
export const indexAssessable = (n: Node | undefined | null): boolean =>
  !!n && (n.kind === 'option' || truthAssessable(n));
export const assessmentFields = (node: Node | undefined | null): { credence: boolean; impact: boolean } => ({
  credence: truthAssessable(node),
  impact: node?.kind === 'claim' && !!node.parentId && !isGate(node),
});
export const isAiProfile = (user: User | undefined | null): boolean => user?.profileKind === 'ai';
export const isHalfStep = (value: number): boolean => Math.round(value * 2) === value * 2;
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
