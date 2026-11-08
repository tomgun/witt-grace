// Read-only projections of selected named assessors (the review lens) and of one assessor's perspective, ported from
// the prototype's `src/review-lens.js` and `src/assessor-view.js`. Nothing here changes a record, weights anyone, or
// infers an identity (inv-review-vote-table §B, inv-canvas §1.10).
import { isAiProfile, truthAssessable } from './model.ts';
import type { EdgeAssessment, Project, Vote } from './model.ts';
import { descendants } from './graph.ts';
import { personalInfluence, summarizeInfluenceReviews } from './reviews.ts';
import type { InfluenceSummary } from './reviews.ts';
import { decisionRankingForAssessor } from './ranking.ts';
import type { PersonalRankedOption } from './ranking.ts';

const mean = (a: number[]): number | null => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const range = (a: number[]): number => (a.length > 1 ? Math.max(...a) - Math.min(...a) : 0);

/** The user ids a lens shows: every human when `ids` is null, else the given ids that still exist. */
export const lensSelected = (project: Project, ids: string[] | null | undefined): Set<string> =>
  ids === null || ids === undefined
    ? new Set(project.users.filter((u) => !isAiProfile(u)).map((u) => u.id))
    : new Set(ids.filter((id) => project.users.some((u) => u.id === id)));

export interface CredenceStats {
  mean: number | null;
  count: number;
  range: number;
  reviews: (Vote & { name: string })[];
}
export interface ImpactStats extends InfluenceSummary {
  range: number;
  reviews: (EdgeAssessment & { name: string })[];
}
export interface Disagreement {
  kind: 'credence' | 'impact';
  nodeId: string;
  title: string;
  spread: number;
  rawSpread: number;
  units: '/100' | '/5';
  count: number;
  details: string[];
  signSplit?: boolean;
  status?: InfluenceSummary['status'];
  positive?: number;
  negative?: number;
  neutral?: number;
}
export interface Lens {
  userIds: Set<string>;
  filtered: boolean;
  credence: Map<string, CredenceStats>;
  impact: Map<string, ImpactStats>;
  disagreements: Disagreement[];
  comparisons: { a: string; b: string; shared: number; distance: number | null }[];
  selectedCount: number;
  totalCount: number;
}

export function projectLens(project: Project, ids: string[] | null = null): Lens {
  const people = lensSelected(project, ids);
  const filtered = ids !== null && ids !== undefined;
  const votes = project.votes.filter((v) => people.has(v.userId));
  const edges = (project.edgeAssessments ?? []).filter((a) => people.has(a.userId));
  const credence = new Map<string, CredenceStats>();
  const impact = new Map<string, ImpactStats>();
  const rows: Disagreement[] = [];
  const byUser = new Map(project.users.map((u) => [u.id, u.name]));
  for (const node of project.nodes) {
    const rv = votes.filter((v) => v.nodeId === node.id);
    const rvStats: CredenceStats = {
      mean: mean(rv.map((v) => v.confidence)),
      count: rv.length,
      range: range(rv.map((v) => v.confidence)),
      reviews: rv.map((v) => ({ ...v, name: byUser.get(v.userId) ?? '' })),
    };
    credence.set(node.id, rvStats);
    if (rv.length >= 2)
      rows.push({
        kind: 'credence',
        nodeId: node.id,
        title: node.title,
        spread: rvStats.range,
        rawSpread: rvStats.range,
        units: '/100',
        count: rv.length,
        details: rvStats.reviews.map((v) => `${v.name}: ${v.confidence}/100`),
      });
    if (node.parentId && node.relation !== 'option') {
      const parent = project.nodes.find((n) => n.id === node.parentId);
      const fingerprint = JSON.stringify([
        node.id,
        node.parentId,
        node.title,
        parent?.title ?? '',
        node.relation,
      ]);
      const good = edges.filter(
        (a) => a.subjectType === 'primary' && a.subjectId === node.id && a.fingerprint === fingerprint
      );
      const ir: ImpactStats = {
        ...summarizeInfluenceReviews(good),
        range: range(good.map((a) => a.influence)),
        reviews: good.map((v) => ({ ...v, name: byUser.get(v.userId) ?? '' })),
      };
      impact.set(node.id, ir);
      if (good.length >= 2)
        rows.push({
          kind: 'impact',
          nodeId: node.id,
          title: node.title,
          spread: ir.range * 10,
          rawSpread: ir.range,
          units: '/5',
          count: good.length,
          signSplit: ir.signConflict,
          status: ir.status,
          positive: ir.positive,
          negative: ir.negative,
          neutral: ir.neutral,
          details: ir.reviews.map((v) => `${v.name}: ${v.influence > 0 ? '+' : ''}${v.influence}/5`),
        });
    }
  }
  rows.sort((a, b) => b.spread - a.spread || a.title.localeCompare(b.title));
  const comparisons: Lens['comparisons'] = [];
  const ordered = project.users.filter((u) => people.has(u.id));
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]!;
      const b = ordered[j]!;
      const differences: number[] = [];
      for (const node of project.nodes) {
        const av = votes.find((v) => v.userId === a.id && v.nodeId === node.id);
        const bv = votes.find((v) => v.userId === b.id && v.nodeId === node.id);
        if (av && bv) differences.push(Math.abs(av.confidence - bv.confidence));
        const ai = impact.get(node.id);
        if (ai) {
          const x = ai.reviews.find((v) => v.userId === a.id);
          const y = ai.reviews.find((v) => v.userId === b.id);
          if (x && y) differences.push(Math.abs(x.influence - y.influence) * 10);
        }
      }
      if (differences.length >= 3)
        comparisons.push({ a: a.name, b: b.name, shared: differences.length, distance: mean(differences) });
    }
  comparisons.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || b.shared - a.shared);
  return {
    userIds: people,
    filtered,
    credence,
    impact,
    disagreements: rows,
    comparisons,
    selectedCount: people.size,
    totalCount:
      filtered && ordered.some((u) => isAiProfile(u))
        ? project.users.length
        : project.users.filter((u) => !isAiProfile(u)).length,
  };
}

export interface AssessorSummary {
  user: Project['users'][number];
  credenceReviews: number;
  primaryReviews: number;
  secondaryReviews: number;
  rows: (PersonalRankedOption & { reviewedPrimary: number; eligible: boolean })[];
  leadingIds: string[];
  best: number | null;
}
/** One assessor's perspective; a base-50 option with no argument ratings never becomes a highlighted "winner". */
export function assessorSummary(project: Project, assessorId: string): AssessorSummary {
  const user = project.users.find((u) => u.id === assessorId);
  if (!user) throw Error('Unknown assessor');
  const credenceReviews = project.votes.filter(
    (v) => v.userId === assessorId && project.nodes.some((n) => n.id === v.nodeId && truthAssessable(n))
  ).length;
  const edges = project.edgeAssessments ?? [];
  const primaryReviews = edges.filter(
    (a) =>
      a.userId === assessorId &&
      a.subjectType === 'primary' &&
      personalInfluence(project, 'primary', a.subjectId, assessorId).current
  ).length;
  const secondaryReviews = edges.filter(
    (a) =>
      a.userId === assessorId &&
      a.subjectType === 'secondary' &&
      personalInfluence(project, 'secondary', a.subjectId, assessorId).current
  ).length;
  const options = project.mode === 'decision' ? decisionRankingForAssessor(project, assessorId) : [];
  const rows = options.map((item) => {
    const below = new Set(descendants(project, item.node.id));
    const reviewedPrimary = edges.filter(
      (a) =>
        a.userId === assessorId &&
        a.subjectType === 'primary' &&
        below.has(a.subjectId) &&
        personalInfluence(project, 'primary', a.subjectId, assessorId).current
    ).length;
    return {
      ...item,
      reviewedPrimary,
      eligible:
        !!item.complete &&
        item.feasibility.status === 'feasible' &&
        reviewedPrimary > 0 &&
        Number.isFinite(item.score),
    };
  });
  const contenders = rows.filter((r) => r.eligible);
  const best = contenders.length ? Math.max(...contenders.map((r) => r.score as number)) : null;
  const leadingIds = contenders
    .filter((r) => best !== null && Math.abs((r.score as number) - best) < 1e-7)
    .map((r) => r.node.id);
  return { user, credenceReviews, primaryReviews, secondaryReviews, rows, leadingIds, best };
}
