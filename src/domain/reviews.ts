// Reading people's reviews: which relation a review is about, whether it is still current, and read-only summaries.
import { directionFromInfluence, isAiProfile, relationFingerprint } from './model.ts';
import type { EdgeAssessment, Node, Project, Stance, SubjectType, Vote } from './model.ts';

export interface AssessmentRelation {
  subjectType: SubjectType;
  subjectId: string;
  source: Node;
  target: Node;
  relation: string;
  fingerprint: string;
  suggestedInfluence: number;
}
/** The relation a review is about: a claim's primary parent relation, or a secondary link. Throws when none exists. */
export function assessmentRelation(
  project: Project,
  subjectType: SubjectType,
  subjectId: string
): AssessmentRelation {
  if (subjectType !== 'primary' && subjectType !== 'secondary') throw new Error('Tuntematon suhteen laji');
  const nodes = new Map(project.nodes.map((n) => [n.id, n]));
  let source: Node | undefined;
  let target: Node | undefined;
  let relation: string;
  let documentImpact: number;
  if (subjectType === 'primary') {
    source = nodes.get(subjectId);
    if (
      !source ||
      source.kind !== 'claim' ||
      !source.parentId ||
      source.relation === 'option' ||
      source.relation === 'group'
    )
      throw new Error('Väitteellä ei ole arvioitavaa suhdetta');
    target = nodes.get(source.parentId);
    relation = source.relation;
    documentImpact = source.impact;
  } else {
    const link = (project.links ?? []).find((l) => l.id === subjectId);
    if (!link) throw new Error('Lisäyhteyttä ei löydy');
    source = nodes.get(link.sourceId);
    target = nodes.get(link.targetId);
    relation = link.relation;
    documentImpact = link.impact;
  }
  if (!source || !target) throw new Error('Arvioitavan suhteen solmu puuttuu');
  return {
    subjectType,
    subjectId,
    source,
    target,
    relation,
    fingerprint: relationFingerprint(source, target, relation),
    suggestedInfluence: relation === 'neutral' ? 0 : (relation === 'oppose' ? -1 : 1) * documentImpact,
  };
}
export const personalCredence = (project: Project, nodeId: string, userId: string): Vote | null =>
  project.votes.find((v) => v.nodeId === nodeId && v.userId === userId) ?? null;
export interface PersonalInfluence {
  record: EdgeAssessment | null;
  /** The record exists and its fingerprint still matches the relation. */
  current: boolean;
  relation: AssessmentRelation;
}
export function personalInfluence(
  project: Project,
  subjectType: SubjectType,
  subjectId: string,
  userId: string
): PersonalInfluence {
  const relation = assessmentRelation(project, subjectType, subjectId);
  const record =
    (project.edgeAssessments ?? []).find(
      (a) => a.subjectType === subjectType && a.subjectId === subjectId && a.userId === userId
    ) ?? null;
  return { record, current: !!record && record.fingerprint === relation.fingerprint, relation };
}
/** The stance a person sees for a claim: their current review's sign, else the authored template. */
export function displayedStance(project: Project, node: Node, userId: string): Stance {
  if (node.kind !== 'claim' || !node.parentId) return node.relation;
  try {
    const own = personalInfluence(project, 'primary', node.id, userId);
    return directionFromInfluence(own.current && own.record ? own.record.influence : null, node.relation);
  } catch {
    return node.relation;
  }
}
export function currentInfluenceReviews(
  project: Project,
  subjectType: SubjectType,
  subjectId: string,
  includeAi = false
): EdgeAssessment[] {
  const relation = assessmentRelation(project, subjectType, subjectId);
  const eligible = new Set(project.users.filter((u) => includeAi || !isAiProfile(u)).map((u) => u.id));
  return (project.edgeAssessments ?? []).filter(
    (a) =>
      a.subjectType === subjectType &&
      a.subjectId === subjectId &&
      a.fingerprint === relation.fingerprint &&
      eligible.has(a.userId)
  );
}
export type InfluenceStatus =
  'unassessed' | 'contradictory' | 'neutral' | 'mixed-neutral' | 'support' | 'oppose';
export interface InfluenceSummary {
  count: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  positive: number;
  negative: number;
  neutral: number;
  status: InfluenceStatus;
  signConflict: boolean;
}
/** Read-only diagnostic. Opposite CURRENT signs are disagreement, never neutrality, even when the mean is zero. */
export function summarizeInfluenceReviews(rows: { influence: number }[]): InfluenceSummary {
  const positive = rows.filter((a) => a.influence > 0).length;
  const negative = rows.filter((a) => a.influence < 0).length;
  const neutral = rows.filter((a) => a.influence === 0).length;
  const count = rows.length;
  const mean = count ? rows.reduce((sum, a) => sum + a.influence, 0) / count : null;
  const status: InfluenceStatus = !count
    ? 'unassessed'
    : positive && negative
      ? 'contradictory'
      : neutral === count
        ? 'neutral'
        : neutral
          ? 'mixed-neutral'
          : positive
            ? 'support'
            : 'oppose';
  return {
    count,
    mean,
    min: count ? Math.min(...rows.map((a) => a.influence)) : null,
    max: count ? Math.max(...rows.map((a) => a.influence)) : null,
    positive,
    negative,
    neutral,
    status,
    signConflict: Boolean(positive && negative),
  };
}
export const influenceSummary = (
  project: Project,
  subjectType: SubjectType,
  subjectId: string,
  includeAi = false
): InfluenceSummary =>
  summarizeInfluenceReviews(currentInfluenceReviews(project, subjectType, subjectId, includeAi));
