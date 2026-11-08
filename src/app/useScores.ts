// Scores for the current viewpoint, recomputed only when the document, the viewpoint or the person changes.
import { useMemo } from 'react';
import { evaluate, evaluateAssessor } from '../domain/index.ts';
import type { Project, Scores } from '../domain/index.ts';
import type { Viewpoint } from './store.ts';

export function useScores(project: Project, viewpoint: Viewpoint, actorId: string): Scores {
  return useMemo(
    () => (viewpoint === 'personal' ? evaluateAssessor(project, actorId) : evaluate(project)),
    [project, viewpoint, actorId]
  );
}
