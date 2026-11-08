// Ordering decision options: feasibility first, then completeness, then the explanatory balance. Not a recommendation.
import type { Node, Project } from './model.ts';
import { evaluate, evaluateAssessor } from './scoring.ts';
import type { NodeScore, Scores } from './scoring.ts';
import { optionFeasibility } from './eligibility.ts';
import type { Feasibility } from './eligibility.ts';
import { optionPreference } from './ballots.ts';
import type { Preference } from './ballots.ts';

const priority: Record<Feasibility['status'], number> = { feasible: 0, unresolved: 1, blocked: 2 };

export interface RankedOption extends NodeScore, Preference {
  node: Node;
  feasibility: Feasibility;
}
export function decisionRanking(project: Project, scores: Scores = evaluate(project)): RankedOption[] {
  return project.nodes
    .filter((n) => n.relation === 'option')
    .map((node) => ({
      node,
      ...(scores.get(node.id) as NodeScore),
      ...optionPreference(project, node.id),
      feasibility: optionFeasibility(project, node.id),
    }))
    .sort(
      (a, b) =>
        priority[a.feasibility.status] - priority[b.feasibility.status] ||
        Number(a.incomplete) - Number(b.incomplete) ||
        (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
        a.node.title.localeCompare(b.node.title)
    );
}
export interface PersonalRankedOption extends NodeScore {
  node: Node;
  feasibility: Feasibility;
  complete: boolean;
}
/** One person's ranking never borrows anyone else's reviews; an unreviewed option stays unranked, not low. */
export function decisionRankingForAssessor(
  project: Project,
  userId: string,
  scores: Scores = evaluateAssessor(project, userId)
): PersonalRankedOption[] {
  return project.nodes
    .filter((n) => n.relation === 'option')
    .map((node) => {
      const opinion = scores.get(node.id) ?? {
        score: null,
        balance: null,
        base: null,
        delta: null,
        positive: 0,
        negative: 0,
        contributions: [],
        incomplete: true,
      };
      return {
        node,
        ...opinion,
        feasibility: optionFeasibility(project, node.id),
        complete: opinion.score !== null && !opinion.incomplete,
      };
    })
    .sort(
      (a, b) =>
        priority[a.feasibility.status] - priority[b.feasibility.status] ||
        Number(b.complete) - Number(a.complete) ||
        (a.complete && b.complete ? (b.score as number) - (a.score as number) : 0) ||
        a.node.title.localeCompare(b.node.title)
    );
}
