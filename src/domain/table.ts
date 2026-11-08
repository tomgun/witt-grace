// The read-only table projection, ported from the prototype's `src/table-model.js` (UX-06, inv-review-vote-table
// §F.4, §F.6). Every row is a claim in primary-tree order; secondary edges are details, never duplicated rows;
// collapsed children stay available for inspection. Pure: no DOM, no clock, no random.
import type { Comment, EdgeAssessment, Link, Node, Project, Stance, Vote } from './model.ts';

export const TABLE_STANCES = ['all', 'support', 'oppose', 'option'] as const;
export type TableStance = (typeof TABLE_STANCES)[number];

export interface TableFilters {
  /** One of `TABLE_STANCES`; anything else reads as `all`. */
  stance?: string | null;
  query?: string | null;
}

export interface TableRow {
  id: string;
  node: Node;
  depth: number;
  parent: Node | null;
  grandparent: Node | null;
  ancestors: { id: string; title: string }[];
  /** Titles from the root down to this node. */
  path: string[];
  /** The option (or the root claim) the chain polarity is measured against; null under a decision root or a group. */
  anchorId: string | null;
  anchorTitle: string;
  /** +1 / −1 when the node's authored chain pushes for or against the anchor, 0 for roots, options and groups. */
  chainDirection: number;
  relation: Stance;
  isCollapsedDescendant: boolean;
}

export type ReviewDetail = { id: string; userId: string; name: string; credence: number; updatedAt: string };
export type ImpactReviewDetail = EdgeAssessment & { name: string; stale: boolean };
export type LinkDetail = Link & {
  direction: 'outgoing' | 'incoming';
  otherId: string;
  otherTitle: string;
  impactReviews: ImpactReviewDetail[];
};
export interface AssessmentDetails {
  node: Node;
  reviews: ReviewDetail[];
  /** Primary-relation reviews, only for claims with a parent and a non-option relation. */
  impactReviews: ImpactReviewDetail[];
  links: LinkDetail[];
  comments: Comment[];
  /** The authored template credence. */
  credence: number;
}

const fold = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase();

const asStance = (value: string | null | undefined): TableStance =>
  (TABLE_STANCES as readonly string[]).includes(value ?? '') ? (value as TableStance) : 'all';

/** Depth-first rows from every root, in document order, filtered by direct relation and a folded text search.
 * Non-matching nodes are skipped but their children are still walked; collapse state never hides a row. */
export function projectRows(project: Project, filters: TableFilters = {}): TableRow[] {
  const stance = asStance(filters.stance);
  const query = fold(filters.query).trim();
  const byId = new Map(project.nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, Node[]>();
  for (const node of project.nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }
  const roots = children.get(null) ?? [];
  const rows: TableRow[] = [];
  const visited = new Set<string>();
  const walk = (node: Node, ancestors: Node[], polarity: number, anchor: Node | null): void => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    const nextAnchor = node.relation === 'option' ? node : node.relation === 'group' ? null : anchor;
    const nextPolarity =
      node.relation === 'option' || node.relation === 'group' || node.parentId === null
        ? 0
        : (polarity || 1) * (node.relation === 'oppose' ? -1 : 1);
    const parent = (node.parentId !== null && byId.get(node.parentId)) || null;
    const grandparent = (parent && parent.parentId !== null && byId.get(parent.parentId)) || null;
    const path = [...ancestors, node];
    const relatives = ancestors.map((item) => item.title).join(' › ');
    const matchesQuery = !query || fold([node.title, node.details, relatives].join(' ')).includes(query);
    const matchesStance = stance === 'all' || node.relation === stance;
    if (matchesQuery && matchesStance)
      rows.push({
        id: node.id,
        node,
        depth: ancestors.length,
        parent,
        grandparent,
        ancestors: ancestors.map((item) => ({ id: item.id, title: item.title })),
        path: path.map((item) => item.title),
        anchorId: nextAnchor?.id ?? null,
        anchorTitle: nextAnchor?.title ?? '',
        chainDirection: nextPolarity,
        relation: node.relation,
        isCollapsedDescendant: ancestors.some((item) => item.collapsed === true),
      });
    for (const child of children.get(node.id) ?? []) walk(child, path, nextPolarity, nextAnchor);
  };
  for (const root of roots) walk(root, [], 0, root.kind === 'decision' ? null : root);
  return rows;
}

/** Everything the expanded detail row shows for one node; null for an unknown id. Stale relation reviews stay
 * visible but are flagged, never silently presented as current. */
export function assessmentDetails(project: Project, nodeId: string): AssessmentDetails | null {
  const users = new Map((project.users ?? []).map((user) => [user.id, user]));
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const reviews: ReviewDetail[] = (project.votes ?? [])
    .filter((v: Vote) => v.nodeId === nodeId)
    .map((v) => ({
      id: v.id,
      userId: v.userId,
      name: users.get(v.userId)?.name ?? '',
      credence: v.confidence,
      updatedAt: v.updatedAt,
    }));
  const ratings = project.edgeAssessments ?? [];
  const nodeOf = (id: string | null | undefined): Node | undefined => project.nodes.find((n) => n.id === id);
  const forRelation = (type: 'primary' | 'secondary', id: string): ImpactReviewDetail[] => {
    const subject: Node | Link | undefined =
      type === 'primary' ? nodeOf(id) : (project.links ?? []).find((l) => l.id === id);
    if (!subject) return [];
    const source = type === 'primary' ? (subject as Node) : nodeOf((subject as Link).sourceId);
    const target =
      type === 'primary' ? nodeOf((subject as Node).parentId) : nodeOf((subject as Link).targetId);
    const fingerprint = JSON.stringify([
      source?.id,
      target?.id,
      source?.title,
      target?.title,
      subject.relation,
    ]);
    return ratings
      .filter((a) => a.subjectType === type && a.subjectId === id)
      .map((a) => ({ ...a, name: users.get(a.userId)?.name ?? '', stale: a.fingerprint !== fingerprint }));
  };
  const impactReviews =
    node.kind === 'claim' && node.parentId && node.relation !== 'option'
      ? forRelation('primary', nodeId)
      : [];
  const links: LinkDetail[] = (project.links ?? [])
    .filter((link) => link.sourceId === nodeId || link.targetId === nodeId)
    .map((link) => {
      const outgoing = link.sourceId === nodeId;
      const otherId = outgoing ? link.targetId : link.sourceId;
      return {
        ...link,
        direction: outgoing ? 'outgoing' : 'incoming',
        otherId,
        otherTitle: nodeOf(otherId)?.title ?? '',
        impactReviews: forRelation('secondary', link.id),
      };
    });
  return {
    node,
    reviews,
    impactReviews,
    links,
    comments: (project.comments ?? []).filter((c) => c.nodeId === nodeId),
    credence: node.confidence,
  };
}
