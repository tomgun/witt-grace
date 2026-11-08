// Decision ballots: a separate, optional preference vote with weights frozen per round. Reads only; commands live in commands/.
import { isAiProfile } from './model.ts';
import type { Ballot, Project } from './model.ts';

export interface Preference {
  preferenceScore: number | null;
  preferenceVoters: number;
  preferenceTotalPower: number;
  weightedSum: number;
}
export function optionPreferenceForRound(
  round: { weightByUser: Record<string, number> },
  ballots: Ballot[],
  optionId: string
): Preference {
  let weighted = 0;
  let totalPower = 0;
  let count = 0;
  for (const ballot of ballots.filter((b) => b.optionId === optionId)) {
    const power = round.weightByUser[ballot.userId] ?? 0;
    if (power <= 0) continue;
    weighted += power * ballot.preference;
    totalPower += power;
    count++;
  }
  return {
    preferenceScore: totalPower ? weighted / totalPower : null,
    preferenceVoters: count,
    preferenceTotalPower: totalPower,
    weightedSum: weighted,
  };
}
/** Weights come from the open or closed round; without a round, a preview with the document's vote weighting. */
export function optionPreference(project: Project, optionId: string): Preference {
  const round = project.votingRound;
  if (round) return optionPreferenceForRound(round, project.ballots, optionId);
  const preview = {
    weightByUser: Object.fromEntries(
      project.users
        .filter((u) => !isAiProfile(u))
        .map((u) => [u.id, project.settings.voteWeighting === 'shares' ? u.shares : 1])
    ),
  };
  return optionPreferenceForRound(preview, project.ballots, optionId);
}
