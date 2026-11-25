// Presentation-level derivations shared by the canvas, outline, table and inspector, ported from the prototype's
// app.js helpers (inv-canvas §1.5, inv-inspector §F). Pure functions over the document, the scores and the view.
import {
  argumentBalance,
  assertNever,
  assessmentFields,
  baseConfidence,
  credenceSpread,
  descendants,
  directionFromInfluence,
  indexAssessable,
  influenceSummary,
  isGate,
  isValue,
  marginalIndexEffects,
  marginalTargetEffects,
  personalCredence,
  personalInfluence,
  riskRole,
  riskRoleIsGood,
  SCORING_RULES,
  sharedReason,
  viewpointSpread,
} from '../domain/index.ts';
import type {
  Lens,
  Mode,
  Node,
  NodeScore,
  Project,
  RiskRole,
  Scores,
  Stance,
  TargetEffect,
} from '../domain/index.ts';
import { fig } from './numberFormat.ts';
import type { MessageKey, Translator } from '../lib/i18n/i18n.ts';
import { MODE_LABEL_KEYS } from '../lib/workspaceMeta.ts';
import type { Layers, ViewState } from './view.ts';

export const EM_DASH = '—';
/** The prototype's `signed`: a plus sign for positives, otherwise the plain JS number. */
export const signed = (value: number): string => fig(value > 0 ? `+${value}` : String(value));

/** Visible balance text `S = 2I − 100` with `digits` decimals and an explicit sign; `—` when null. */
export function balanceText(internal: number | null | undefined, digits = 1): string {
  const value = argumentBalance(internal ?? null);
  if (value === null) return EM_DASH;
  const rounded = Number(value.toFixed(digits));
  return fig((rounded > 0 ? '+' : '') + rounded.toFixed(digits));
}
export function balanceDeltaText(internalDelta: number | null | undefined, digits = 1): string {
  if (internalDelta === null || internalDelta === undefined || !Number.isFinite(internalDelta))
    return EM_DASH;
  const rounded = Number((2 * internalDelta).toFixed(digits));
  return fig((rounded > 0 ? '+' : '') + rounded.toFixed(digits));
}
/** A derived result exists only for index-assessable nodes with at least one scored contribution. */
export const derivedResult = (node: Node, result: NodeScore | undefined | null): boolean =>
  indexAssessable(node) &&
  result?.score !== null &&
  result?.score !== undefined &&
  (result.contributions ?? []).some((item) => !item.missing);
/** A computed credence as a percentage (anchored versions: a rated claim's result is a credence, 0–100 %). */
export const credencePercentText = (internal: number | null | undefined, digits = 1): string =>
  internal == null ? EM_DASH : fig(`${internal.toFixed(digits)} %`);
/** One internal value of a node in the form its result has: a percentage for a credence, else a signed balance. */
export const valueText = (
  result: NodeScore | undefined | null,
  internal: number | null | undefined,
  digits = 1
): string => (result?.credence ? credencePercentText(internal, digits) : balanceText(internal, digits));
/** Result text plus the ` †` marker for an incomplete result; `—` for leaves, values, gates and groups. A rated
 * claim under the anchored versions reads as a credence percentage; under direct-reasons-v1 it is what its reasons
 * give, in parentheses because the rating, not this figure, is what passes upward. */
export const resultText = (node: Node, result: NodeScore | undefined | null, digits = 1): string => {
  if (!derivedResult(node, result)) return EM_DASH;
  const mark = result!.incomplete ? ' †' : '';
  if (result!.derived !== undefined) return `(${credencePercentText(result!.derived, digits)})${mark}`;
  return valueText(result, result!.score, digits) + mark;
};

/** A balance read in words: which way the reasons lean, from the figure as it is shown (one decimal), so the word
 * never disagrees with the number beside it. Null for a result that is a credence percentage or not derived. */
export function balanceReading(
  node: Node,
  result: NodeScore | undefined | null
): 'leansFor' | 'leansAgainst' | 'leansNeither' | null {
  if (!derivedResult(node, result) || result!.credence || result!.derived !== undefined) return null;
  const shown = Number((argumentBalance(result!.score) ?? 0).toFixed(1));
  return shown > 0 ? 'leansFor' : shown < 0 ? 'leansAgainst' : 'leansNeither';
}

export interface DeriveContext {
  project: Project;
  /** The document as it scores when reasons are muted for a what-if; the document itself when none is. */
  scored?: Project;
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

/** The name of a document type. */
export const modeLabelKey = (mode: Mode): MessageKey => MODE_LABEL_KEYS[mode];
/** The tag of a role in a risk tree (WG-058). */
export function riskRoleKey(role: RiskRole): MessageKey {
  switch (role) {
    case 'goal':
      return 'riskRoleGoal';
    case 'action':
      return 'riskRoleAction';
    case 'risk':
      return 'riskRoleRisk';
    case 'cause':
      return 'riskRoleCause';
    case 'mitigation':
      return 'riskRoleMitigation';
    default:
      return assertNever(role);
  }
}
/** The words of the card's + and − in a risk tree: what is added under this node (WG-058). */
/** The text a new node of the role carries until it is written: a question that says what belongs there. */
export function riskNewTitleKey(role: Exclude<RiskRole, 'goal'>): MessageKey {
  switch (role) {
    case 'action':
      return 'riskNewAction';
    case 'risk':
      return 'riskNewRisk';
    case 'cause':
      return 'riskNewCause';
    case 'mitigation':
      return 'riskNewMitigation';
    default:
      return assertNever(role);
  }
}
export function riskAddKey(role: Exclude<RiskRole, 'goal'>): MessageKey {
  switch (role) {
    case 'action':
      return 'riskAddAction';
    case 'risk':
      return 'riskAddRisk';
    case 'cause':
      return 'riskAddCause';
    case 'mitigation':
      return 'riskAddMitigation';
    default:
      return assertNever(role);
  }
}
/** The node's role in a risk tree as it reads now: in the direction people have given it. Null outside one. */
export const shownRiskRole = (ctx: DeriveContext, node: Node): RiskRole | null =>
  riskRole(ctx.project, node, (n) => displayedPrimaryRelation(ctx, n));
/** The relation a card is coloured by: in a risk tree what is good for the goal looks supporting and what is bad
 * looks opposing (a mitigation opposes its risk, yet it is on the goal's side); elsewhere the shown relation. */
export function cardTone(ctx: DeriveContext, node: Node): Stance {
  const role = shownRiskRole(ctx, node);
  if (!role || role === 'goal') return displayedPrimaryRelation(ctx, node);
  return riskRoleIsGood(role) ? 'support' : 'oppose';
}

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
  // In a risk tree the role is the tag, and the person's own type name stands in its place (owner 2026-11-25).
  const role = shownRiskRole(ctx, node);
  if (role) return reasonTypeLabel(node) ?? t(riskRoleKey(role));
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
/** True when the claim has a reason that can score into it (a primary reason or a secondary link from a claim). */
export function hasScoringReasons(project: Project, node: Node): boolean {
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
/** Under the versions where a claim with reasons starts neutral, its own credence is only a felt sense, saved for
 * comparison but never scored (owner decision 2026-11-09). Under the prototype's and the anchored versions it counts. */
export function credenceIsFeeling(project: Project, node: Node): boolean {
  if (SCORING_RULES[project.settings.scoring].claimBase !== 'neutral') return false;
  if (node.kind !== 'claim' || node.sharedReasonId) return false;
  return hasScoringReasons(project, node);
}
/** The note under the credence slider of a claim with reasons when the rating counts in a way worth saying. */
export function credenceNoteKey(project: Project, node: Node): MessageKey | null {
  const rule = SCORING_RULES[project.settings.scoring];
  if (rule.claimBase !== 'anchored' || node.kind !== 'claim' || node.parentId === null) return null;
  if (!hasScoringReasons(project, node)) return null;
  return rule.direct ? 'ownCredenceDirectNote' : 'ownCredenceAnchorNote';
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
  fig(Number.isInteger(num) ? String(num) : Number(num.toFixed(1)).toString());

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
  const { view, lens } = ctx;
  const project = ctx.scored ?? ctx.project;
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

export interface ReviewSpread {
  /** Full sentences for a tooltip: the range of credence ratings, of influence ratings and of people's own results. */
  ratings: string[];
  results: string | null;
  /** The compact card text, e.g. `40–90%/-1…+2!`; null when fewer than two people gave anything to compare. */
  short: string | null;
  signConflict: boolean;
}
const NO_SPREAD: ReviewSpread = { ratings: [], results: null, short: null, signConflict: false };
/** How far apart the counted people are on a node (owner 2026-11-18): shown in tooltips, and on the card only
 * when the view asks. Needs two people; nothing in a personal view, under a review filter or for a locked reason. */
export function reviewSpread(ctx: DeriveContext, t: Translator, node: Node): ReviewSpread {
  const { project, view, lens } = ctx;
  if (view.indexMode === 'personal' || lens.filtered || node.sharedReasonId) return NO_SPREAD;
  if (project.settings.assessmentWeighting === 'structural') return NO_SPREAD;
  const fields = assessmentFields(node);
  const ratings: string[] = [];
  const short: string[] = [];
  let signConflict = false;
  const credence = fields.credence ? credenceSpread(project, node.id) : null;
  if (credence && credence.count > 1) {
    const range = `${fmt(credence.min)}–${fmt(credence.max)}`;
    ratings.push(t('spreadCredence', { range, count: credence.count }));
    short.push(`${range}%`);
  }
  if (fields.impact) {
    const influence = influenceSummary(project, 'primary', node.id);
    if (influence.count > 1 && influence.min !== null && influence.max !== null) {
      const range = `${signed(Number(influence.min.toFixed(1)))}…${signed(Number(influence.max.toFixed(1)))}`;
      ratings.push(t('spreadInfluence', { range, count: influence.count }));
      signConflict = influence.signConflict;
      if (signConflict) ratings.push(t('spreadSignConflict'));
      short.push(range + (signConflict ? '!' : ''));
    }
  }
  let results: string | null = null;
  const score = ctx.scores.get(node.id);
  if (derivedResult(node, score)) {
    const own = viewpointSpread(ctx.scored ?? project, node.id);
    if (own && own.count > 1) {
      const range = `${valueText(score, own.min, 0)}…${valueText(score, own.max, 0)}`;
      results = t('spreadResults', { range, count: own.count });
      if (!short.length) short.push(range);
    }
  }
  return { ratings, results, short: short.length ? short.join('/') : null, signConflict };
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
  const spread = reviewSpread(ctx, t, node);
  const said = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ');
  if (l.index)
    chips.push({
      // A rated claim's result under the anchored versions is a credence, not a net balance.
      label: t(score?.credence && derivedResult(node, score) ? 'computedCredenceChip' : 'indexChip'),
      value: ctx.lens.filtered && view.indexMode === 'shared' ? EM_DASH : resultText(node, score, 0),
      cls: 'meta-index',
      title: said(
        view.indexMode === 'personal' ? t('personalIndexExplain') : t('indexHint'),
        score?.net && score.score !== null
          ? score.score > 50
            ? t('netPassesShort', { share: Math.round(2 * score.score - 100) })
            : t('netPassesNothing')
          : null,
        spread.results
      ),
    });
  if (l.assessments && ratings)
    chips.push({
      label: t('assessmentSummaryShort'),
      value: ratings.value,
      cls: `meta-assessment${ratings.averaging ? ' aggregated' : ''}${ratings.filtered ? ' filtered' : ''}`,
      title: said(ratings.provenance, ...spread.ratings),
    });
  if (view.showSpread && spread.short)
    chips.push({
      label: t('spreadChip'),
      value: spread.short,
      cls: `meta-spread${spread.signConflict ? ' conflict' : ''}`,
      title: said(t('spreadHint'), ...spread.ratings, spread.results),
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
