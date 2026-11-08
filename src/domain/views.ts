// View-only projections: what is visible, what a focus highlights, review order. They never change the document.
import { assessmentFields, isValue } from './model.ts';
import type { Node, Project } from './model.ts';
import { descendants, rootNode } from './graph.ts';
import { influenceSummary, personalInfluence } from './reviews.ts';
import type { InfluenceSummary } from './reviews.ts';

export function visibleNodes(project: Project): Node[] {
  const hidden = new Set<string>();
  for (const node of project.nodes)
    if (node.collapsed) for (const id of descendants(project, node.id)) hidden.add(id);
  return project.nodes.filter((node) => !hidden.has(node.id));
}

export type FocusStance = 'all' | 'support' | 'oppose';
export interface FocusProjection {
  anchorId: string;
  stance: FocusStance;
  nodes: Node[];
  visibleIds: Set<string>;
  matchIds: Set<string>;
  contextIds: Set<string>;
  peekIds: Set<string>;
  polarity: Map<string, number>;
  matches: number;
}
/**
 * A rebuttal of a rebuttal supports its ancestor. Options are neutral branch boundaries. Matching descendants are
 * revealed even under a collapsed ancestor; nothing saved changes.
 */
export function focusProjection(
  project: Project,
  anchorId: string | null,
  stance: FocusStance = 'all'
): FocusProjection {
  const anchor = project.nodes.find((n) => n.id === anchorId) ?? (rootNode(project) as Node);
  const normalNodes = visibleNodes(project);
  const normalIds = new Set(normalNodes.map((n) => n.id));
  if (stance === 'all')
    return {
      anchorId: anchor.id,
      stance,
      nodes: normalNodes,
      visibleIds: normalIds,
      matchIds: new Set(),
      contextIds: new Set(),
      peekIds: new Set(),
      polarity: new Map(),
      matches: 0,
    };
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, Node[]>();
  for (const node of project.nodes) {
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId)?.push(node);
  }
  const polarity = new Map<string, number>([[anchor.id, 0]]);
  const matchIds = new Set<string>();
  const stack: { node: Node; sign: number }[] = [{ node: anchor, sign: 0 }];
  while (stack.length) {
    const { node, sign } = stack.pop() as { node: Node; sign: number };
    for (const child of children.get(node.id) ?? []) {
      const next =
        child.relation === 'option'
          ? 0
          : child.relation === 'support'
            ? sign || 1
            : child.relation === 'oppose'
              ? sign
                ? -sign
                : -1
              : 0;
      polarity.set(child.id, next);
      if ((stance === 'support' && next === 1) || (stance === 'oppose' && next === -1))
        matchIds.add(child.id);
      stack.push({ node: child, sign: next });
    }
  }
  const visibleIds = new Set(normalIds);
  const contextIds = new Set([anchor.id]);
  function revealPath(id: string): void {
    for (let node = byId.get(id); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
      visibleIds.add(node.id);
      contextIds.add(node.id);
    }
  }
  revealPath(anchor.id);
  for (const id of matchIds) revealPath(id);
  const peekIds = new Set([...visibleIds].filter((id) => !normalIds.has(id)));
  return {
    anchorId: anchor.id,
    stance,
    nodes: project.nodes.filter((n) => visibleIds.has(n.id)),
    visibleIds,
    matchIds,
    contextIds,
    peekIds,
    polarity,
    matches: matchIds.size,
  };
}
/** An explicit user collapse overrides view-only peeks. */
export function respectExplicitCollapse(
  project: Project,
  projection: FocusProjection,
  explicitlyClosedIds: Iterable<string>
): FocusProjection {
  const hidden = new Set<string>();
  for (const id of explicitlyClosedIds) {
    if (!project.nodes.some((n) => n.id === id && n.collapsed)) continue;
    for (const childId of descendants(project, id)) hidden.add(childId);
  }
  if (!hidden.size) return projection;
  const filtered = (ids: Set<string>) => new Set([...ids].filter((id) => !hidden.has(id)));
  const visibleIds = filtered(projection.visibleIds);
  const matchIds = filtered(projection.matchIds);
  return {
    ...projection,
    nodes: projection.nodes.filter((n) => visibleIds.has(n.id)),
    visibleIds,
    matchIds,
    contextIds: filtered(projection.contextIds),
    peekIds: filtered(projection.peekIds),
    matches: matchIds.size,
  };
}
export function optionGroupPath(project: Project, id: string): Node[] {
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  let current = byId.get(id);
  const path: Node[] = [];
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.kind === 'group') path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
/** Guided review order: depth-first from the root, every node that has a credence or an impact to review. */
export function assessmentOrder(project: Project): string[] {
  const byParent = new Map<string | null, Node[]>();
  for (const node of project.nodes) {
    if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
    byParent.get(node.parentId)?.push(node);
  }
  const result: string[] = [];
  function visit(node: Node): void {
    const fields = assessmentFields(node);
    if (!node.sharedReasonId && (fields.credence || fields.impact)) result.push(node.id);
    for (const child of byParent.get(node.id) ?? []) visit(child);
  }
  const root = rootNode(project);
  if (root) visit(root);
  return result;
}
export interface ValueProfileItem {
  nodeId: string;
  title: string;
  source: 'primary' | 'secondary';
  relationId: string;
  direction: number;
  indirect: boolean;
  impact: number | null;
  assessed: boolean;
  summary: InfluenceSummary;
}
/** Values are judged by the same signed influence; they get no importance score and no truth rating. */
export function optionValueProfile(
  project: Project,
  optionId: string,
  userId: string
): { items: ValueProfileItem[]; values: number; assessed: number; missing: number } {
  const option = project.nodes.find((n) => n.id === optionId && n.relation === 'option');
  if (!option) throw new Error('Unknown decision option');
  if (!project.users.some((u) => u.id === userId)) throw new Error('Tuntematon arvioijaprofiili');
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const items: ValueProfileItem[] = [];
  function append(
    node: Node,
    source: 'primary' | 'secondary',
    relationId: string,
    direction: number,
    indirect = false
  ) {
    const own = personalInfluence(project, source, relationId, userId);
    const summary = influenceSummary(project, source, relationId);
    items.push({
      nodeId: node.id,
      title: node.title,
      source,
      relationId,
      direction,
      indirect,
      impact: own.current && own.record ? own.record.influence : null,
      assessed: own.current,
      summary,
    });
  }
  for (const node of project.nodes) {
    if (!isValue(node)) continue;
    let cursor: Node | undefined = node;
    let direction = 1;
    let indirect = false;
    while (cursor && cursor.id !== optionId && cursor.parentId) {
      if (cursor.relation === 'oppose') direction *= -1;
      if (cursor.relation === 'neutral') direction = 0;
      if (cursor.id !== node.id) indirect = true;
      cursor = byId.get(cursor.parentId);
    }
    if (cursor?.id === optionId) append(node, 'primary', node.id, direction, indirect);
  }
  for (const link of project.links ?? []) {
    const source = byId.get(link.sourceId);
    if (link.targetId === optionId && source && isValue(source))
      append(source, 'secondary', link.id, link.relation === 'oppose' ? -1 : 1);
  }
  return {
    items,
    values: new Set(items.map((i) => i.nodeId)).size,
    assessed: items.filter((i) => i.assessed).length,
    missing: items.filter((i) => !i.assessed).length,
  };
}
/** Diagnostic only: same text or a shared source URL. No merging, no score correction. */
export function potentialEvidenceOverlap(
  project: Project,
  nodeId: string
): { nodeId: string; title: string; reasons: string[] }[] {
  const subject = project.nodes.find((n) => n.id === nodeId);
  if (!subject) throw new Error('Väitettä ei löytynyt');
  const textKey = (n: Node) =>
    n.title
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const urls = (n: Node) =>
    new Set(
      (n.sources ?? []).map((s) => {
        try {
          const u = new URL(s.url);
          u.hash = '';
          u.pathname = u.pathname.replace(/\/+$/, '') || '/';
          return u.toString();
        } catch {
          return s.url;
        }
      })
    );
  const key = textKey(subject);
  const sourceUrls = urls(subject);
  return project.nodes
    .filter((n) => n.id !== nodeId)
    .map((n) => {
      const reasons: string[] = [];
      if (key && textKey(n) === key) reasons.push('same-text');
      if (sourceUrls.size && [...urls(n)].some((x) => sourceUrls.has(x))) reasons.push('shared-source');
      return { nodeId: n.id, title: n.title, reasons };
    })
    .filter((row) => row.reasons.length);
}
