// Tree and graph reads over a project: children, root, descendants, lookups and cycle detection.
import type { Link, Node, Project, ReasonConcept, SharedReason } from './model.ts';

export const childrenOf = (project: Project, id: string): Node[] =>
  project.nodes.filter((n) => n.parentId === id);
export const rootNode = (project: Project): Node | undefined =>
  project.nodes.find((n) => n.parentId === null);
export const nodeById = (project: Project, id: string): Node | undefined =>
  project.nodes.find((n) => n.id === id);
export const sharedReason = (project: Project, id: string): SharedReason | null =>
  (project.sharedReasons ?? []).find((r) => r.id === id) ?? null;
export const reasonConcept = (project: Project, id: string): ReasonConcept | null =>
  (project.reasonConcepts ?? []).find((r) => r.id === id) ?? null;

export function childrenIndex(nodes: Node[]): Map<string | null, Node[]> {
  const index = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const list = index.get(node.parentId);
    if (list) list.push(node);
    else index.set(node.parentId, [node]);
  }
  return index;
}
export function incomingIndex(links: Link[]): Map<string, Link[]> {
  const index = new Map<string, Link[]>();
  for (const link of links) {
    const list = index.get(link.targetId);
    if (list) list.push(link);
    else index.set(link.targetId, [link]);
  }
  return index;
}
export function descendants(project: Project, id: string): string[] {
  const found: string[] = [];
  const stack = [id];
  const visited = new Set([id]);
  while (stack.length) {
    const next = stack.pop() as string;
    for (const child of childrenOf(project, next)) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      found.push(child.id);
      stack.push(child.id);
    }
  }
  return found;
}
/** True when following parent edges plus secondary links from any node returns to itself. */
export function graphHasCycle(
  nodes: Node[],
  links: Link[],
  override: { id: string; parentId: string | null } | null = null
): boolean {
  const outgoing = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const n of nodes) {
    const parent = override && n.id === override.id ? override.parentId : n.parentId;
    if (parent) outgoing.get(n.id)?.push(parent);
  }
  for (const link of links) outgoing.get(link.sourceId)?.push(link.targetId);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of outgoing.get(id) ?? []) if (visit(target)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return nodes.some((n) => visit(n.id));
}
/** The option, or the argument-mode thesis, that a node's chain of primary parents ends at; null otherwise. */
export function scoredAnchor(project: Project, id: string): string | null {
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  let node = byId.get(id);
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    if (node.kind === 'option') return node.id;
    if (node.parentId === null) return node.kind === 'claim' ? node.id : null;
    node = byId.get(node.parentId);
  }
  return null;
}
/** Informational: two declared routes that may meet at a common scored ancestor. Never discards an edge. */
export function secondaryOverlapWarning(project: Project, link: Link): boolean {
  const sourceAnchor = scoredAnchor(project, link.sourceId);
  const targetAnchor = scoredAnchor(project, link.targetId);
  return !!sourceAnchor && sourceAnchor === targetAnchor;
}
