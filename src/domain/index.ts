// Public surface of the domain. UI and infrastructure import from here, never from a sibling file's internals.
export * from './model.ts';
export { parseProject, ParseError } from './parse.ts';
export {
  childrenOf,
  rootNode,
  nodeById,
  descendants,
  graphHasCycle,
  sharedReason,
  reasonConcept,
  secondaryOverlapWarning,
} from './graph.ts';
export {
  evaluate,
  evaluateAssessor,
  marginalIndexEffects,
  marginalTargetEffects,
  assessmentWeighting,
  assessmentPower,
  baseConfidence,
  credenceSpread,
  viewpointSpread,
  median,
} from './scoring.ts';
export type { Spread } from './scoring.ts';
export type { Contribution, NodeScore, Scores, MarginalEffect, TargetEffect } from './scoring.ts';
export {
  assessmentRelation,
  subtreeFingerprint,
  credenceSubtreeChanged,
  personalCredence,
  personalInfluence,
  displayedStance,
  currentInfluenceReviews,
  summarizeInfluenceReviews,
  influenceSummary,
  abstentionExcusals,
  hasAbstained,
  isExcused,
} from './reviews.ts';
export type { AssessmentRelation, PersonalInfluence, InfluenceSummary, InfluenceStatus } from './reviews.ts';
export { optionFeasibility } from './eligibility.ts';
export type { Feasibility, FeasibilityStatus } from './eligibility.ts';
export { optionPreference, optionPreferenceForRound } from './ballots.ts';
export type { Preference } from './ballots.ts';
export { decisionRanking, decisionRankingForAssessor } from './ranking.ts';
export type { RankedOption, PersonalRankedOption } from './ranking.ts';
export {
  BLANK_TITLE,
  createBlankProject,
  newNode,
  autoLayoutPositions,
  arranged,
  cardsOverlap,
} from './project.ts';
export type { CreateInput, NewNodeInput } from './project.ts';
export {
  visibleNodes,
  focusProjection,
  respectExplicitCollapse,
  optionGroupPath,
  assessmentOrder,
  mutable,
  withoutBranches,
  optionValueProfile,
  potentialEvidenceOverlap,
} from './views.ts';
export type { FocusProjection, FocusStance, ValueProfileItem } from './views.ts';
export {
  applyCommand,
  applyCommands,
  canReparent,
  canAddLink,
  canAttachReasonConcept,
  canReuseClaimAt,
} from './commands.ts';
export type { Command, CommandType, CommandContext } from './commands.ts';
export { serializeProjectFile, serializeProjectCompact, exportFilename } from './serialize.ts';
export {
  CARD_W,
  ORIENTATIONS,
  viewPosition,
  documentPosition,
  fourWayProjection,
  edgeGeometry,
  secondaryLinkPath,
  fourWayVisualDirections,
  stableFourWayAddition,
  compactVisibleProjection,
  depthProjection,
  maxTreeDepth,
} from './layout.ts';
export type { LayoutNode, Orientation, Cardinal, Direction, Projection, DepthProjection } from './layout.ts';
export { NAV_KEYS, visibleOrder, spatialNeighbor, navigate } from './navigation.ts';
export type { NavNode, NavAction } from './navigation.ts';
export { projectLens, lensSelected, assessorSummary } from './lens.ts';
export type { Lens, CredenceStats, ImpactStats, Disagreement, AssessorSummary } from './lens.ts';
export { projectRows, assessmentDetails, TABLE_STANCES } from './table.ts';
export type {
  TableStance,
  TableFilters,
  TableRow,
  AssessmentDetails,
  ReviewDetail,
  ImpactReviewDetail,
  LinkDetail,
} from './table.ts';
// AI drafts, change proposals and the import preflight (src/domain/ai/): no network, ids and clock passed in.
export {
  DRAFT_FORMAT,
  DRAFT_FORMAT_V2,
  DRAFT_SCHEMA,
  DRAFT_SCHEMA_V2,
  DRAFT_EXAMPLE,
  DRAFT_EXAMPLE_V2,
  MAX_DRAFT_PARTICIPANTS,
  parseAiDraft,
  draftToProject,
  draftSummary,
  buildDraftPrompt,
  buildFetchedBrief,
  draftFromLink,
  unfenced,
  DRAFT_LINK_LIMIT,
  DRAFT_LINK_PACKED,
  DRAFT_LINK_PREFIX,
  DRAFT_IMPORT_FRAGMENT,
} from './ai/draft.ts';
export type {
  AiDraft,
  AiDraftClaim,
  AiDraftRoot,
  AiDraftSharedReason,
  AiDraftAttachment,
  AiDraftLink,
  AiDraftComment,
  AiDraftParticipant,
  DraftFormat,
  DraftImportOptions,
  DraftPromptInput,
  DraftSummary,
} from './ai/draft.ts';
export {
  STARTER_FORMAT,
  STARTER_SCHEMA,
  parseStarter,
  starterToProject,
  buildStarterPrompt,
} from './ai/starter.ts';
export type { StarterDraft, StarterClaim } from './ai/starter.ts';
export {
  CONTRIBUTION_FORMAT,
  CONTRIBUTION_BUNDLE_FORMAT,
  CONTRIBUTION_REQUEST_FORMAT,
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_SCHEMA,
  CONTRIBUTION_BUNDLE_SCHEMA,
  CONTRIBUTION_EXAMPLE,
  isContributionBundle,
  parseContribution,
  parseMultiAuthorBundle,
  parseContributionBundle,
  projectFingerprint,
  buildContributionRequest,
  contributionPromptFromRequest,
  buildContributionPrompt,
  previewContribution,
  applyContribution,
  diffContribution,
  exportContribution,
} from './ai/contribution.ts';
export type {
  ContributionPatch,
  ContributionBundle,
  Contributor,
  Proposal,
  ContributionAuthor,
  ContributionCategory,
  ContributionTask,
  ContributionRequest,
  ContributionChoices,
  ContributionPreview,
  ImportContext,
  MergeCounts,
  MergeResult,
  BundleMergeResult,
} from './ai/contribution.ts';
export {
  inspectImport,
  importReportText,
  importFormatOf,
  checkSchema,
  IMPORT_FORMAT_NAMES,
} from './ai/importReport.ts';
export type { ImportFormat, ImportIssue, ImportReport, InspectOptions } from './ai/importReport.ts';
export type { JsonSchema } from './ai/jsonSchema.ts';
export * from './session.ts';
export { applySketchOps, diffSketch, packSketchOps } from './sketchOps.ts';
export type { SketchOp } from './sketchOps.ts';
export { SKETCH_LIMITS, serializeSketch } from './sketch.ts';
export type { Sketch } from './sketch.ts';
export {
  WORKBOOK_FORMAT,
  WORKBOOK_VERSION,
  WORKBOOK_MAX_DOCUMENTS,
  WORKBOOK_TITLE_MAX,
  workbookOf,
  isPlainDocument,
  diagramLabel,
  parseWorkbook,
  serializeWorkbookFile,
  workbookFileObject,
  workbookFilename,
  renameWorkbook,
  replaceDocument,
  attachDocuments,
  removeDocument,
  moveDocument,
  readWorkbookText,
  restoreWorkbook,
  addSketch,
  drawSketch,
  renameSketch,
  removeSketch,
  restructure,
  projectPeople,
  peopleElsewhere,
  personIdFor,
  renamePersonElsewhere,
  WORKBOOK_MAX_SKETCHES,
} from './workbook.ts';
export type { ProjectSketch, Workbook, WorkbookRead } from './workbook.ts';
