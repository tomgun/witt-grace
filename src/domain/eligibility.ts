// Hard constraints and prerequisites gate an option's feasibility; they never become negative weights in a score.
import { isGate } from './model.ts';
import type { Project } from './model.ts';
import { descendants, nodeById } from './graph.ts';

export type FeasibilityStatus = 'feasible' | 'unresolved' | 'blocked';
export interface Feasibility {
  status: FeasibilityStatus;
  gates: { nodeId: string; title: string; status: 'unknown' | 'met' | 'unmet'; kind?: string }[];
  unmet: number;
  unknown: number;
}
/** Only the option's own subtree gates it. An unknown gate prevents `feasible`; an unmet gate blocks regardless of score. */
export function optionFeasibility(project: Project, optionId: string): Feasibility {
  const option = project.nodes.find((n) => n.id === optionId && n.relation === 'option');
  if (!option) throw new Error('Päätösvaihtoehtoa ei löytynyt');
  const gates = descendants(project, optionId)
    .map((id) => nodeById(project, id))
    .filter((n) => !!n && isGate(n))
    .map((n) => n!);
  const unmet = gates.filter((n) => n.constraintStatus === 'unmet');
  const unknown = gates.filter((n) => !n.constraintStatus || n.constraintStatus === 'unknown');
  return {
    status: unmet.length ? 'blocked' : unknown.length ? 'unresolved' : 'feasible',
    gates: gates.map((n) => ({
      nodeId: n.id,
      title: n.title,
      status: n.constraintStatus ?? 'unknown',
      ...(n.semanticType !== undefined ? { kind: n.semanticType } : {}),
    })),
    unmet: unmet.length,
    unknown: unknown.length,
  };
}
