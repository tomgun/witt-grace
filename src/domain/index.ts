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
} from './scoring.ts';
export type { Contribution, NodeScore, Scores, MarginalEffect, TargetEffect } from './scoring.ts';
export {
  assessmentRelation,
  personalCredence,
  personalInfluence,
  displayedStance,
  currentInfluenceReviews,
  summarizeInfluenceReviews,
  influenceSummary,
} from './reviews.ts';
export type { AssessmentRelation, PersonalInfluence, InfluenceSummary, InfluenceStatus } from './reviews.ts';
export { optionFeasibility } from './eligibility.ts';
export type { Feasibility, FeasibilityStatus } from './eligibility.ts';
export { optionPreference, optionPreferenceForRound } from './ballots.ts';
export type { Preference } from './ballots.ts';
export { decisionRanking, decisionRankingForAssessor } from './ranking.ts';
export type { RankedOption, PersonalRankedOption } from './ranking.ts';
export { createBlankProject, newNode, autoLayoutPositions } from './project.ts';
export type { CreateInput, NewNodeInput } from './project.ts';
export {
  visibleNodes,
  focusProjection,
  respectExplicitCollapse,
  optionGroupPath,
  assessmentOrder,
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
