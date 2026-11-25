// The roles of a risk tree's nodes (WG-058, owner 2026-11-24/25: "Riskit", the root a goal, supporting actions kept as
// their own kind, as they support the goal and do not hold back a risk). A role is read from where a node stands,
// never stored. The root is the goal. What supports the goal is a supporting action; what opposes something good for
// the goal (the goal, an action, a mitigation) is a risk. What supports something bad for it (a risk, a cause) is a
// cause, and what opposes it a mitigation. A reason for an action or a mitigation, a neutral note, an option or a
// group has no role, and neither has anything under it. Display only: scoring reads the relations, never a role.
import type { Node, Project, RiskRole, Stance } from './model.ts';
import { assertNever } from './model.ts';

const isGood = (role: RiskRole): boolean => {
  switch (role) {
    case 'goal':
    case 'action':
    case 'mitigation':
      return true;
    case 'risk':
    case 'cause':
      return false;
    default:
      return assertNever(role);
  }
};

/** The role a child of a node in `parent` role takes when it stands in `relation` to it. */
export function childRiskRole(parent: RiskRole, relation: Stance): Exclude<RiskRole, 'goal'> | null {
  if (relation === 'support') return parent === 'goal' ? 'action' : isGood(parent) ? null : 'cause';
  if (relation === 'oppose') return isGood(parent) ? 'risk' : 'mitigation';
  return null;
}

/** The node's role in a risk tree, or null outside one. `direction` is the relation the node is read in (the
 * assessed direction where people have turned it; the authored relation by default). */
export function riskRole(
  project: Project,
  node: Node,
  direction: (node: Node) => Stance = (n) => n.relation
): RiskRole | null {
  if (project.mode !== 'risk') return null;
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const path: Node[] = [];
  const seen = new Set<string>();
  for (
    let at: Node | undefined = node;
    at && !seen.has(at.id);
    at = at.parentId ? byId.get(at.parentId) : undefined
  ) {
    seen.add(at.id);
    path.unshift(at);
  }
  if (path[0]?.parentId !== null) return null;
  let role: RiskRole | null = 'goal';
  for (const step of path.slice(1)) {
    if (role === null) return null;
    role = childRiskRole(role, direction(step));
  }
  return role;
}

/** Whether the role is good for the goal: the card is coloured as a supporting one when it is, else as an opposing. */
export const riskRoleIsGood = isGood;
