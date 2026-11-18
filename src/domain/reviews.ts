// Reading people's reviews: which relation a review is about, whether it is still current, and read-only summaries.
import { directionFromInfluence, isAiProfile, relationFingerprint } from './model.ts';
import type { EdgeAssessment, Node, Project, Stance, SubjectType, Vote } from './model.ts';

const excusalCache = new WeakMap<Project, Map<string, Set<string>>>();
/**
 * Owner 2026-11-10: a person who chose "En arvioi (muut voivat)" on a reason takes no part in it or in the branch below
 * it: their credences and primary influences there count nowhere (the shared result, the lens, the shown means, their
 * own viewpoint) and they are not expected there. Kept, not deleted. Returns node id → the people excused there.
 */
export function abstentionExcusals(project: Project): Map<string, Set<string>> {
  const cached = excusalCache.get(project);
  if (cached) return cached;
  const result = new Map<string, Set<string>>();
  excusalCache.set(project, result);
  if (!project.abstentions?.length) return result;
  const children = new Map<string, Node[]>();
  for (const n of project.nodes)
    if (n.parentId) {
      if (!children.has(n.parentId)) children.set(n.parentId, []);
      children.get(n.parentId)?.push(n);
    }
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  for (const abstention of project.abstentions) {
    const start = byId.get(abstention.nodeId);
    if (!start) continue;
    const stack = [start];
    const seen = new Set<string>();
    for (let n = stack.pop(); n; n = stack.pop()) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (!result.has(n.id)) result.set(n.id, new Set());
      result.get(n.id)?.add(abstention.userId);
      stack.push(...(children.get(n.id) ?? []));
    }
  }
  return result;
}
/** The person chose "En arvioi" on this reason itself (not only above it). */
export const hasAbstained = (project: Project, nodeId: string, userId: string): boolean =>
  (project.abstentions ?? []).some((a) => a.nodeId === nodeId && a.userId === userId);
export const isExcused = (project: Project, nodeId: string, userId: string): boolean =>
  abstentionExcusals(project).get(nodeId)?.has(userId) ?? false;

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
/** A short stable digest of a string (cyrb53); identity of content, never a secret. */
function digest(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
/**
 * What lies below a claim, as a digest: every descendant's id, parent, title, relation, kind of reason and unrated
 * flag, and every secondary link into the claim or a descendant. The order of siblings and other people's ratings
 * are not part of it. A credence rating stores it, so a later change below the claim can be told (owner 2026-11-18).
 */
export function subtreeFingerprint(project: Project, nodeId: string): string {
  const children = new Map<string, Node[]>();
  for (const n of project.nodes)
    if (n.parentId) {
      if (!children.has(n.parentId)) children.set(n.parentId, []);
      children.get(n.parentId)?.push(n);
    }
  const inside = new Set<string>([nodeId]);
  const rows: string[] = [];
  const stack = [...(children.get(nodeId) ?? [])];
  for (let n = stack.pop(); n; n = stack.pop()) {
    if (inside.has(n.id)) continue;
    inside.add(n.id);
    rows.push(
      JSON.stringify([n.id, n.parentId, n.title, n.relation, n.semanticType ?? null, n.unrated === true])
    );
    stack.push(...(children.get(n.id) ?? []));
  }
  const titles = new Map(project.nodes.map((n) => [n.id, n.title]));
  for (const link of project.links ?? [])
    if (inside.has(link.targetId))
      rows.push(
        JSON.stringify([
          link.id,
          link.sourceId,
          link.targetId,
          link.relation,
          titles.get(link.sourceId) ?? '',
        ])
      );
  return digest(rows.sort().join('\n'));
}
/** The claim's reasons changed after this rating was given. A rating without a stored digest is never marked. */
export const credenceSubtreeChanged = (project: Project, vote: Vote | null | undefined): boolean =>
  !!vote && vote.subtree !== undefined && vote.subtree !== subtreeFingerprint(project, vote.nodeId);
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
      eligible.has(a.userId) &&
      !(subjectType === 'primary' && isExcused(project, subjectId, a.userId))
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
