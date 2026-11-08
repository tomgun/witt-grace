// Text the table and the mobile argument list show, ported line by line from the prototype's renderTable and
// renderMobileArguments (inv-review-vote-table §F.5–§F.8). Pure functions over the frame's derive context:
// the numbers come from the same snapshot, lens and score maps the cards use, and "—" is never a zero.
import { baseConfidence, influenceSummary, truthAssessable } from '../domain/index.ts';
import type { AssessmentDetails, InfluenceSummary, Lens, Node, TableRow } from '../domain/index.ts';
import type { Translator } from '../lib/i18n/i18n.ts';
import {
  EM_DASH,
  displayedPrimaryRelation,
  nodeAssessmentSnapshot,
  resultText,
  shownInfluence,
  shownScore,
  signed,
} from './derive.ts';
import type { DeriveContext } from './derive.ts';

/** The relation column: root type by kind, group, option, else the displayed (assessed) direction. */
export function tableRelationName(ctx: DeriveContext, t: Translator, node: Node): string {
  if (node.parentId === null) return t(node.kind === 'decision' ? 'rootDecisionType' : 'rootClaimType');
  const direction = displayedPrimaryRelation(ctx, node);
  if (direction === 'group') return t('optionGroupType');
  if (direction === 'option') return t('optionWord');
  return t(direction === 'support' ? 'supportWord' : direction === 'oppose' ? 'opposeWord' : 'neutralWord');
}

/** The mobile list's relation word: a decision root also reads as the main claim there, as in the prototype. */
export function mobileRelationWord(ctx: DeriveContext, t: Translator, row: TableRow): string {
  const direction = displayedPrimaryRelation(ctx, row.node);
  const word =
    direction === 'root'
      ? t('rootClaimType')
      : direction === 'support'
        ? t('supportWord')
        : direction === 'oppose'
          ? t('opposeWord')
          : direction === 'neutral'
            ? t('neutralWord')
            : direction === 'group'
              ? t('optionGroupType')
              : t('optionWord');
  return `${'↳ '.repeat(Math.min(3, row.depth))}${row.depth > 3 ? '… ' : ''}${word}`;
}

/** The "+ ketjun suunta" hint when the authored relation and the chain polarity towards the anchor disagree. */
export function chainHint(t: Translator, row: TableRow): { text: string; title: string } | null {
  const { node } = row;
  if (
    row.depth > 1 &&
    row.chainDirection &&
    row.relation !== 'option' &&
    (node.relation === 'oppose' ? -1 : 1) !== row.chainDirection
  )
    return {
      text: `${row.chainDirection > 0 ? '+' : '−'} ${t('tableChain')}`,
      title: t('tableChainHint', { anchor: row.anchorTitle }),
    };
  return null;
}

export interface EvaluationCells {
  credence: string;
  impact: string;
  index: string;
  /** Tooltip for the credence and impact cells: where the numbers came from. */
  provenance: string;
  /** Review distribution behind the impact cell (shared mode only); a tag is shown for the ambiguous statuses. */
  status: InfluenceSummary | null;
}

/** The three evaluation cells of a row: the viewed perspective's credence and influence with review counts, the
 * document baseline marked `*`, the lens subset's mean with its count, and the index hidden under a filtered lens. */
export function evaluationCells(ctx: DeriveContext, t: Translator, node: Node): EvaluationCells {
  const { project, view, lens } = ctx;
  const personal = view.indexMode === 'personal';
  const base = baseConfidence(project, node);
  const edge =
    node.parentId && node.relation !== 'option' && node.relation !== 'group'
      ? influenceSummary(project, 'primary', node.id)
      : null;
  const ratings = nodeAssessmentSnapshot(ctx, t, node);
  const selectedCredence = lens.credence.get(node.id);
  const selectedEdge = lens.impact.get(node.id);
  const credence = !truthAssessable(node)
    ? EM_DASH
    : personal
      ? ratings?.credence == null
        ? EM_DASH
        : `${ratings.credence.toFixed(0)} %`
      : lens.filtered
        ? selectedCredence?.count && selectedCredence.mean !== null
          ? `${selectedCredence.mean.toFixed(0)} % (${selectedCredence.count})`
          : EM_DASH
        : ratings?.credence == null
          ? EM_DASH
          : `${ratings.credence.toFixed(0)} %${base.votesCount ? ` (${base.votesCount})` : '*'}`;
  const influence = shownInfluence(ctx, node);
  const impact = personal
    ? influence === null
      ? EM_DASH
      : signed(influence)
    : lens.filtered
      ? selectedEdge?.count && selectedEdge.mean !== null
        ? `${signed(Number(selectedEdge.mean.toFixed(1)))} (${selectedEdge.count})`
        : EM_DASH
      : influence === null
        ? EM_DASH
        : `${signed(Number(influence.toFixed(1)))}${
            project.settings.assessmentWeighting === 'structural'
              ? '*'
              : edge?.count
                ? ` (${edge.count})`
                : ''
          }`;
  const index =
    lens.filtered && view.indexMode === 'shared' ? EM_DASH : resultText(node, shownScore(ctx, node.id));
  const provenance = ratings?.provenance || t(lens.filtered ? 'lensFilteredHint' : 'profileBaselineNote');
  const status = personal ? null : lens.filtered ? (selectedEdge ?? null) : edge;
  return { credence, impact, index, provenance, status };
}

export interface MobileMetrics {
  credence: string;
  /** Null when the shared index is hidden under a filtered lens. */
  index: string | null;
  /** Null for roots and options (no parent relation to rate). */
  impact: string | null;
  status: InfluenceSummary | null;
}

/** The mobile card's rating line. */
export function mobileMetrics(ctx: DeriveContext, t: Translator, node: Node): MobileMetrics {
  const { project, view, lens } = ctx;
  const ratings = nodeAssessmentSnapshot(ctx, t, node);
  const c = truthAssessable(node)
    ? lens.filtered
      ? lens.credence.get(node.id)?.mean
      : ratings?.credence
    : null;
  const credence = `${t('tableColCredence')}: ${c === null || c === undefined ? EM_DASH : `${c.toFixed(0)} %`}`;
  const index =
    !lens.filtered || view.indexMode === 'personal'
      ? `${t('tableColIndex')}: ${resultText(node, shownScore(ctx, node.id))}`
      : null;
  let impact: string | null = null;
  let status: InfluenceSummary | null = null;
  if (node.parentId && node.relation !== 'option') {
    const ir = lens.filtered ? lens.impact.get(node.id) : influenceSummary(project, 'primary', node.id);
    const value = lens.filtered ? ir?.mean : ratings?.impact;
    impact = `${t('tableColInfluence')}: ${
      value === null || value === undefined ? EM_DASH : `${signed(Number(value.toFixed(1)))}/5`
    }`;
    if (view.indexMode !== 'personal') status = ir ?? null;
  }
  return { credence, index, impact, status };
}

/** Under a filtered lens only the selected assessors' reviews are listed. */
export function lensFilteredDetails(detail: AssessmentDetails, lens: Lens): AssessmentDetails {
  if (!lens.filtered) return detail;
  const keep = <T extends { userId: string }>(items: T[]) => items.filter((v) => lens.userIds.has(v.userId));
  return {
    ...detail,
    reviews: keep(detail.reviews),
    impactReviews: keep(detail.impactReviews),
    links: detail.links.map((link) => ({ ...link, impactReviews: keep(link.impactReviews) })),
  };
}

/** "Perustelut ja kommentit": the notes, then each comment as "author: body" when the comments layer is on. */
export function detailNotes(ctx: DeriveContext, t: Translator, detail: AssessmentDetails): string[] {
  const notes = [detail.node.details || t('tableNoNotes')];
  if (ctx.view.layers.comments && detail.comments.length)
    notes.push(
      ...detail.comments.map(
        (c) =>
          `${ctx.project.users.find((u) => u.id === c.authorId)?.name || c.authorName || t('tableUnknownUser')}: ${c.body}`
      )
    );
  return notes;
}

/** "Arviointi": mean of stored reviews or the document credence, the authored (or lens) influence, the shared
 * index (hidden for decisions, groups and under a filtered lens), the heuristic warning, the document baseline. */
export function detailEvaluationLines(
  ctx: DeriveContext,
  t: Translator,
  detail: AssessmentDetails
): string[] {
  const { project, lens, scores } = ctx;
  const { node } = detail;
  const excluded = node.kind === 'decision' || node.kind === 'group';
  const meanOf = () => {
    const mean = lens.filtered ? lens.credence.get(node.id)?.mean : baseConfidence(project, node).base;
    return mean === null || mean === undefined ? EM_DASH : mean.toFixed(1);
  };
  const lines = [
    excluded
      ? t('lensIndexExcluded')
      : detail.reviews.length
        ? `${t('tableReviewMean')}: ${meanOf()} %`
        : lens.filtered
          ? `${t('tableColCredence')}: ${EM_DASH}`
          : `${t('tableColCredence')}: ${node.confidence} %`,
    node.parentId && node.relation !== 'option' && node.relation !== 'group'
      ? lens.filtered
        ? `${t('tableColInfluence')}: ${
            lens.impact.get(node.id)?.count ? signed(lens.impact.get(node.id)!.mean as number) : EM_DASH
          }/5`
        : `${t('tableColInfluence')}: ${node.relation === 'oppose' ? '−' : '+'}${node.impact}/5`
      : t('tableNoInfluence'),
    excluded || lens.filtered
      ? t('lensIndexExcluded')
      : `${t('tableColIndex')}: ${resultText(node, scores.get(node.id))}`,
    t('tableIndexWarning'),
  ];
  if (detail.reviews.length) lines.push(`${t('tableDocumentCredence')}: ${node.confidence} %`);
  return lines;
}

/** "Osallistujien arviot tiedostossa": one line per stored credence and relation review, stale ones flagged. */
export function detailIndividualLines(t: Translator, detail: AssessmentDetails): string[] {
  return [
    ...detail.reviews.map((r) => `${r.name}: ${t('profileCredenceShort')} ${r.credence} %`),
    ...detail.impactReviews.map(
      (r) =>
        `${r.name}: ${t('profileInfluenceShort')} ${signed(r.influence)}/5${r.stale ? ` · ${t('profileStale')}` : ''}`
    ),
  ];
}

/** "Lisäyhteydet": each secondary link with its direction, then its reviews indented. */
export function detailLinkLines(t: Translator, detail: AssessmentDetails): string[] {
  return detail.links.flatMap((link) => [
    `${link.direction === 'outgoing' ? '↗' : '↙'} ${t(link.relation === 'support' ? 'supportWord' : 'opposeWord')} ${link.impact}/5 — ${link.otherTitle}`,
    ...link.impactReviews.map(
      (r) => `  ${r.name}: ${signed(r.influence)}/5${r.stale ? ` · ${t('profileStale')}` : ''}`
    ),
  ]);
}
