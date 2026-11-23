// The project (several diagrams as tabs, WG-059) in browser storage. The shown diagram keeps its own autosave key
// (`witt-project-v3`, written on every change, the prototype's key); this key holds the whole project and is
// written when the tabs or the sketchpads change: a diagram added, removed, moved, the project renamed, another
// tab shown, a stroke on a project sketchpad (the whole entry is rewritten then; a known cost, see STATUS).
// A project of one unnamed diagram has no entry here, so such a browser stores exactly what it did before tabs.
import { isPlainDocument, parseWorkbook, restoreWorkbook, workbookFileObject } from '../domain/index.ts';
import type { Project, Workbook } from '../domain/index.ts';
import type { KeyValueStore, SaveResult } from './storage.ts';

export const WORKBOOK_KEY = 'witt-workbook-v1';

export function saveWorkbook(
  store: KeyValueStore,
  workbook: Workbook,
  active: number,
  at: string
): SaveResult {
  try {
    if (isPlainDocument(workbook)) store.removeItem(WORKBOOK_KEY);
    else store.setItem(WORKBOOK_KEY, JSON.stringify({ ...workbookFileObject(workbook), active }));
    return { ok: true, at };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export type WorkbookLoad =
  | {
      ok: true;
      workbook: Workbook;
      active: number;
      /** A project entry was read: the tabs come from it. */
      stored: boolean;
      /** A project entry exists but could not be read; it is still in storage. */
      warning?: string;
    }
  | { ok: false; reason: string }
  | { ok: false; empty: true };

/** The project to start with: the stored tabs with the active diagram's own autosave (`fresh`) put in its place.
 * An unreadable entry is reported and left untouched; `fresh` then opens alone. */
export function loadWorkbook(store: KeyValueStore, fresh: Project | null, newId: () => string): WorkbookLoad {
  let stored: { workbook: Workbook; active: number } | null = null;
  let reason: string | null = null;
  try {
    const raw = store.getItem(WORKBOOK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { active?: unknown };
      stored = {
        workbook: parseWorkbook(parsed),
        active: typeof parsed.active === 'number' ? parsed.active : 0,
      };
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  const restored = restoreWorkbook(stored, fresh, newId);
  if (restored)
    return { ok: true, ...restored, stored: stored !== null, ...(reason ? { warning: reason } : {}) };
  return reason ? { ok: false, reason } : { ok: false, empty: true };
}
