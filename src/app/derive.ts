// Presentation-level derivations shared by the canvas, outline, table and inspector, ported from the prototype's
// app.js helpers (inv-canvas §1.5, inv-inspector §F). Pure functions over the document, the scores and the view.
import {
  argumentBalance,
  assessmentFields,
  baseConfidence,
  descendants,
  directionFromInfluence,
  indexAssessable,
  isGate,
  isValue,
  marginalIndexEffects,
  marginalTargetEffects,
  personalCredence,
  personalInfluence,
  SCORING_V3,
  sharedReason,
} from '../domain/index.ts';
import type { Lens, Node, NodeScore, Project, Scores, Stance, TargetEffect } from '../domain/index.ts';
import type { MessageKey, Translator } from '../lib/i18n/i18n.ts';
import type { Layers, ViewState } from './view.ts';

export const EM_DASH = '—';
/** The prototype's `signed`: a plus sign for positives, otherwise the plain JS number. */
export const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));

/** Visible balance text `S = 2I − 100` with `digits` decimals and an explicit sign; `—` when null. */
export function balanceText(internal: number | null | undefined, digits = 1): string {
  const value = argumentBalance(internal ?? null);
  if (value === null) return EM_DASH;
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? '+' : '') + rounded.toFixed(digits);
}
export function balanceDeltaText(internalDelta: number | null | undefined, digits = 1): string {
  if (internalDelta === null || internalDelta === undefined || !Number.isFinite(internalDelta))
    return EM_DASH;
  const rounded = Number((2 * internalDelta).toFixed(digits));
  return (rounded > 0 ? '+' : '') + rounded.toFixed(digits);
}
/** A derived result exists only for index-assessable nodes with at least one scored contribution. */
export const derivedResult = (node: Node, result: NodeScore | undefined | null): boolean =>
  indexAssessable(node) &&
  result?.score !== null &&
  result?.score !== undefined &&
  (result.contributions ?? []).some((item) => !item.missing);
/** Balance text plus the ` †` marker for an incomplete result; `—` for leaves, values, gates and groups. */
export const resultText = (node: Node, result: NodeScore | undefined | null, digits = 1): string =>
  derivedResult(node, result)
    ? balanceText(result!.score, digits) + (result!.incomplete ? ' †' : '')
    : EM_DASH;

export interface DeriveContext {
  project: Project;
  view: ViewState;
  actorId: string;
  scores: Scores;
  personalScores: Scores;
  lens: Lens;
}

/** The assessor whose perspective is shown: the chosen one in personal mode when it still exists, else the actor. */
export const viewedAssessorId = (project: Project, view: ViewState, actorId: string): string =>
  view.indexMode === 'personal' &&
  view.viewAssessorId &&
  project.users.some((u) => u.id === view.viewAssessorId)
    ? view.viewAssessorId
    : actorId;

/** The influence actually shown for a child: personal review (or locked value) in personal mode, the weighted
 * contribution that entered the parent score in shared mode; null when missing. */
export function shownInfluence(ctx: DeriveContext, node: Node): number | null {
  if (!node.parentId || node.relation === 'option' || node.relation === 'group') return null;
  const { project, view, scores } = ctx;
  if (view.indexMode === 'personal') {
    if (node.sharedReasonId) return sharedReason(project, node.sharedReasonId)?.influence ?? null;
    const own = personalInfluence(project, 'primary', node.id, viewedAssessorId(project, view, ctx.actorId));
    return own.current && own.record ? own.record.influence : null;
  }
  const edge = scores.get(node.parentId)?.contributions?.find((item) => item.id === node.id);
  return edge && !edge.missing && edge.impact !== null && Number.isFinite(edge.impact) ? edge.impact : null;
}
/** Root, options and groups keep their stored relation; claims show the assessed direction, falling back to the
 * authored template. */
export function displayedPrimaryRelation(ctx: DeriveContext, node: Node): Stance {
  if (node.parentId === null || node.relation === 'option' || node.relation === 'group') return node.relation;
  return directionFromInfluence(shownInfluence(ctx, node), node.relation);
}
/** In a decision, a reason directly under an option rates its significance for that option (direction, strength
 * and how much it matters to the assessor in one number); deeper reasons rate their influence on the parent. Same
 * number and maths either way; only the wording differs (owner decision 2026-11-09, UI_INVENTORY S-15). */
export const ratesSignificance = (project: Project, node: Node): boolean =>
  project.mode === 'decision' && project.nodes.find((n) => n.id === node.parentId)?.kind === 'option';

export function relationLabelKey(ctx: DeriveContext, node: Node): MessageKey {
  if (node.relation === 'group') return 'optionGroupType';
  if (node.relation === 'option') return 'optionType';
  const direction = displayedPrimaryRelation(ctx, node);
  if (direction === 'support') return 'supportType';
  if (direction === 'oppose') return 'opposeType';
  if (direction === 'neutral') return 'neutralWord';
  return node.kind === 'decision' ? 'rootDecisionType' : 'rootClaimType';
}
/** The card's type tag: the person's own type name for the root, an option or a group; for a reason with one, the
 * direction and the name as one phrase; else the built-in tag. */
export function relationLabel(ctx: DeriveContext, t: Translator, node: Node): string {
  if (node.typeLabel && (node.parentId === null || node.kind === 'option' || node.kind === 'group'))
    return node.typeLabel;
  const key = relationLabelKey(ctx, node);
  const typed = reasonTypeLabel(node);
  // A reason with its own type name reads as one phrase: "Puoltava tosiasia", "Neutraali tavoite" (owner, S-15).
  if (typed && (key === 'supportType' || key === 'opposeType' || key === 'neutralWord'))
    return t('typedRelation', {
      relation: t(
        key === 'supportType' ? 'typedSupport' : key === 'opposeType' ? 'typedOppose' : 'typedNeutral'
      ),
      type: typed,
    });
  return t(key);
}
/** Under evidence-v4-reasons a claim with reasons takes its result from them; its own credence is then only a felt
 * sense, saved for comparison but never scored (owner decision 2026-11-09). */
export function credenceIsFeeling(project: Project, node: Node): boolean {
  if (project.settings.scoring === SCORING_V3 || node.kind !== 'claim' || node.sharedReasonId) return false;
  const reason = (n: Node | undefined) => !!n && n.kind === 'claim' && !isGate(n) && !isValue(n);
  return (
    project.nodes.some(
      (n) => n.parentId === node.id && n.relation !== 'option' && n.relation !== 'group' && reason(n)
    ) ||
    (project.links ?? []).some(
      (l) => l.targetId === node.id && reason(project.nodes.find((n) => n.id === l.sourceId))
    )
  );
}

/** A reason's own type name; it joins the direction tag (`relationLabel`). */
export const reasonTypeLabel = (node: Node): string | null =>
  node.typeLabel && node.parentId !== null && node.kind === 'claim' && !node.sharedReasonId
    ? node.typeLabel
    : null;

/** The score of the shown viewpoint. */
export const shownScore = (ctx: DeriveContext, id: string): NodeScore | undefined =>
  ctx.view.indexMode === 'personal' ? ctx.personalScores.get(id) : ctx.scores.get(id);

export interface AssessmentSnapshot {
  credence: number | null;
  impact: number | null;
  value: string;
  provenance: string;
  averaging: boolean;
  filtered: boolean;
}
const fmt = (num: number): string =>
  Number.isInteger(num) ? String(num) : Number(num.toFixed(1)).toString();

/** The compact "75%/+3" pair a card shows, with where the numbers came from. Null when nothing applies. */
export function nodeAssessmentSnapshot(
  ctx: DeriveContext,
  t: Translator,
  node: Node
): AssessmentSnapshot | null {
  const fields = assessmentFields(node);
  if (!fields.credence && !fields.impact) return null;
  const { project, view, lens } = ctx;
  const personal = view.indexMode === 'personal';
  const assessor = viewedAssessorId(project, view, ctx.actorId);
  const shared = node.sharedReasonId ? sharedReason(project, node.sharedReasonId) : null;
  const mode = project.settings.assessmentWeighting;
  const filtered = !personal && lens.filtered && !shared;
  let credence: number | null = null;
  let impact: number | null = null;
  const review = personal ? personalCredence(project, node.id, assessor) : null;
  const aggregated = !personal && !shared ? baseConfidence(project, node) : null;
  if (fields.credence) {
    if (shared) credence = shared.confidence;
    else if (personal) credence = review ? review.confidence : null;
    else if (filtered) credence = null;
    else credence = aggregated?.base ?? null;
  }
  if (fields.impact) {
    if (shared) impact = shared.influence;
    else if (filtered) impact = null;
    else impact = shownInfluence(ctx, node);
  }
  const provenance = shared
    ? t('assessmentSummaryFixed')
    : personal
      ? t('assessmentSummaryPersonal', { name: project.users.find((u) => u.id === assessor)?.name ?? '' })
      : filtered
        ? t('assessmentSummaryFiltered')
        : mode === 'shares'
          ? t('assessmentSummaryWeighted')
          : mode === 'equal'
            ? t('assessmentSummaryMean')
            : mode === 'median'
              ? t('assessmentSummaryMedian')
              : t('assessmentSummaryStructural');
  if (
    node.parentId === null &&
    node.kind === 'claim' &&
    !shared &&
    mode !== 'structural' &&
    (personal ? !review : (aggregated?.votesCount ?? 0) === 0)
  )
    return null;
  const p = credence === null ? EM_DASH : `${fmt(credence)}%`;
  const w = impact === null ? EM_DASH : signed(Number(impact.toFixed(1)));
  return {
    credence,
    impact,
    value: fields.impact ? `${p}/${w}` : p,
    provenance,
    averaging: !personal && mode !== 'structural' && !shared,
    filtered,
  };
}

export interface Importance {
  effects: Map<string, TargetEffect>;
  importantIds: Set<string>;
}
/** Marginal effects on the top target; when highlighting is on, the strongest 20 % per target are "important". */
export function recalculateImportance(ctx: DeriveContext): Importance {
  const { project, view, lens } = ctx;
  const importantIds = new Set<string>();
  if (view.indexMode === 'shared' && lens.filtered) return { effects: new Map(), importantIds };
  const evaluated = view.indexMode === 'personal' ? ctx.personalScores : ctx.scores;
  const effects = marginalTargetEffects(project, evaluated, marginalIndexEffects(project, evaluated));
  if (view.showImportance) {
    const byTarget = new Map<string, TargetEffect[]>();
    for (const effect of effects.values()) {
      if (!(effect.magnitude > 1e-9)) continue;
      if (!byTarget.has(effect.targetId)) byTarget.set(effect.targetId, []);
      byTarget.get(effect.targetId)!.push(effect);
    }
    for (const items of byTarget.values()) {
      items.sort((a, b) => b.magnitude - a.magnitude || a.childId.localeCompare(b.childId));
      for (const item of items.slice(0, Math.ceil(items.length * 0.2))) importantIds.add(item.childId);
    }
  }
  return { effects, importantIds };
}
export const importanceShort = (effect: TargetEffect): string => `${balanceDeltaText(effect.delta, 1)} p`;
export function importanceText(t: Translator, effect: TargetEffect): string {
  return t('importanceTargetChange', { change: balanceDeltaText(effect.delta, 2) });
}
export function importanceHint(project: Project, t: Translator, effect: TargetEffect): string {
  const target = project.nodes.find((n) => n.id === effect.targetId);
  const parent = project.nodes.find((n) => n.id === effect.parentId);
  const main = t('importanceTargetWhatIf', {
    target: target?.title ?? '',
    without: balanceText(effect.targetWithoutScore),
    current: balanceText(effect.targetCurrentScore),
    change: balanceDeltaText(effect.delta, 2),
  });
  const local = t('importanceWhatIf', {
    parent: parent?.title ?? '',
    without: balanceText(effect.localWithoutScore),
    current: balanceText(effect.localCurrentScore),
    change: balanceDeltaText(effect.localDelta, 2),
  });
  return `${main} | ${local}${effect.provisional ? ` ${t('importanceProvisional')}` : ''}`;
}

export interface CardChip {
  label: string;
  value: string;
  cls?: string;
  title?: string;
}
/** The footer chips of a card under a layer set, in the prototype's order (inv-canvas §1.5). */
export function cardChips(
  ctx: DeriveContext,
  t: Translator,
  node: Node,
  l: Layers,
  importance: Importance
): CardChip[] {
  const { project, view } = ctx;
  const chips: CardChip[] = [];
  const ratings = nodeAssessmentSnapshot(ctx, t, node);
  const score = shownScore(ctx, node.id);
  const effect = importance.effects.get(node.id);
  const important = importance.importantIds.has(node.id);
  const childCount = project.nodes.filter((n) => n.parentId === node.id).length;
  const subtreeCount = l.counts && childCount ? descendants(project, node.id).length : 0;
  const linkCount = (project.links ?? []).filter(
    (x) => x.sourceId === node.id || x.targetId === node.id
  ).length;
  const commentCount = project.comments.filter((c) => c.nodeId === node.id).length;
  if (l.index)
    chips.push({
      label: t('indexChip'),
      value: ctx.lens.filtered && view.indexMode === 'shared' ? EM_DASH : resultText(node, score, 0),
      cls: 'meta-index',
      title: view.indexMode === 'personal' ? t('personalIndexExplain') : t('indexHint'),
    });
  if (l.assessments && ratings)
    chips.push({
      label: t('assessmentSummaryShort'),
      value: ratings.value,
      cls: `meta-assessment${ratings.averaging ? ' aggregated' : ''}${ratings.filtered ? ' filtered' : ''}`,
      title: ratings.provenance,
    });
  if (view.showImportance && important && effect)
    chips.push({
      label: 'Δ',
      value: importanceShort(effect),
      cls: 'meta-marginal',
      title: importanceHint(project, t, effect),
    });
  if (l.comments)
    chips.push({ label: t('commentsChip'), value: String(commentCount), title: t('commentsHint') });
  if (l.counts && childCount)
    chips.push(
      // Owner request 2026-11-10: direct children and the whole subtree, "2 / 16", when they differ.
      subtreeCount > childCount
        ? {
            label: t('subtreeChip'),
            value: `${childCount} / ${subtreeCount}`,
            title: t('subtreeHint', { direct: childCount, all: subtreeCount }),
          }
        : { label: t('childrenChip'), value: String(childCount), title: t('childrenHint') }
    );
  if (l.links && linkCount)
    chips.push({ label: t('linksChip'), value: String(linkCount), cls: 'meta-links', title: t('linksHint') });
  return chips;
}

export interface UserTrace {
  created: boolean;
  edited: boolean;
  commented: boolean;
}
/** Owner request 2026-11-10: what one person has left on each node (created it, edited it last, commented on it). */
export function userTraces(project: Project, userId: string): Map<string, UserTrace> {
  const traces = new Map<string, UserTrace>();
  const at = (id: string) => {
    let trace = traces.get(id);
    if (!trace) traces.set(id, (trace = { created: false, edited: false, commented: false }));
    return trace;
  };
  for (const node of project.nodes) {
    if (node.createdBy === userId) at(node.id).created = true;
    if (node.lastEditedBy === userId && node.createdBy !== userId) at(node.id).edited = true;
  }
  for (const comment of project.comments ?? [])
    if (comment.authorId === userId) at(comment.nodeId).commented = true;
  return traces;
}
