// The assessment round's browser-side progress, in the prototype's exact shape (inv-review-vote-table §A.3):
// `witt-assessment-pass-v2:<projectId>:<actorId>` → { cursorId, doneIds, fingerprints }. A "done" mark expires when
// the node, its parent, its relation or the person's own stored values changed since the mark was written.
import { assessmentFields, assessmentOrder, personalCredence, personalInfluence } from '../domain/index.ts';
import type { Project } from '../domain/index.ts';
import { browserStore, readPreference, writePreference } from '../lib/storage.ts';
import type { KeyValueStore } from '../lib/storage.ts';
import { assessmentPassKey } from './view.ts';

export interface AssessmentPass {
  order: string[];
  done: Set<string>;
  cursorId: string | null;
  finished: boolean;
}

/** The browser's key-value store for the pass; a memory store when storage is unavailable. */
export const passStore = (): KeyValueStore => browserStore().store;

/** The prototype's `assessmentFingerprint`: what a done mark was made against; null for a missing node. */
export function assessmentFingerprint(project: Project, id: string, actorId: string): string | null {
  const node = project.nodes.find((n) => n.id === id);
  if (!node) return null;
  const parent = project.nodes.find((n) => n.id === node.parentId);
  const fields = assessmentFields(node);
  const vote = fields.credence ? personalCredence(project, id, actorId) : null;
  let edge: ReturnType<typeof personalInfluence> | null = null;
  if (fields.impact) {
    try {
      edge = personalInfluence(project, 'primary', id, actorId);
    } catch {
      edge = null;
    }
  }
  return JSON.stringify([
    node.title,
    node.details,
    node.parentId,
    parent?.title || '',
    node.relation,
    vote?.confidence ?? null,
    edge?.current && edge.record ? edge.record.influence : null,
    edge?.relation.fingerprint || null,
  ]);
}

/** The prototype's `loadAssessmentPass`: the queue from the document, the marks from the browser, never `finished`. */
export function loadAssessmentPass(store: KeyValueStore, project: Project, actorId: string): AssessmentPass {
  const order = assessmentOrder(project);
  let saved: { cursorId?: unknown; doneIds?: unknown; fingerprints?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(readPreference(store, assessmentPassKey(project.id, actorId)) || '{}');
    if (typeof parsed === 'object' && parsed !== null) saved = parsed as typeof saved;
  } catch {
    // Storage is convenience, never a requirement.
  }
  const allowed = new Set(order);
  const fingerprints =
    typeof saved.fingerprints === 'object' && saved.fingerprints !== null
      ? (saved.fingerprints as Record<string, unknown>)
      : {};
  const done = new Set(
    Array.isArray(saved.doneIds)
      ? (saved.doneIds as unknown[]).filter(
          (id): id is string =>
            typeof id === 'string' &&
            allowed.has(id) &&
            fingerprints[id] === assessmentFingerprint(project, id, actorId)
        )
      : []
  );
  const cursorId =
    typeof saved.cursorId === 'string' && allowed.has(saved.cursorId)
      ? saved.cursorId
      : (order.find((id) => !done.has(id)) ?? order[0] ?? null);
  return { order, done, cursorId, finished: false };
}

export function saveAssessmentPass(
  store: KeyValueStore,
  project: Project,
  actorId: string,
  pass: AssessmentPass
): void {
  writePreference(
    store,
    assessmentPassKey(project.id, actorId),
    JSON.stringify({
      cursorId: pass.cursorId,
      doneIds: [...pass.done],
      fingerprints: Object.fromEntries(
        [...pass.done].map((id) => [id, assessmentFingerprint(project, id, actorId)])
      ),
    })
  );
}

/** A removed profile takes its browser-side progress with it. */
export function removeAssessmentPass(store: KeyValueStore, projectId: string, userId: string): void {
  try {
    store.removeItem(assessmentPassKey(projectId, userId));
  } catch {
    // optional
  }
}
