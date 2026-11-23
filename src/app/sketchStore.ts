// The project's sketchpads as the sketchpad screen reads and draws them (WG-056, owner 2026-11-23: “lehtiö on osa
// projektia… ei sessio tarvitse omaa”). A sketchpad is part of the project in the app's store: saved in the
// project file and the project's storage entry once something is drawn on it, and in a collaboration drawn on by
// everyone in the session. There is no sketchpad apart from the project.
import { blankSketch, sketchHasDrawing } from '../domain/sketch.ts';
import type { Sketch } from '../domain/sketch.ts';
import { newId } from '../lib/providers.ts';
import { getStore } from './store.ts';

export interface SketchStore {
  get(): Sketch;
  set(sketch: Sketch): void;
  subscribe(listener: () => void): () => void;
}
export const hasDrawing = sketchHasDrawing;

/** A sheet of the sketchpad screen, as the `witt-sketch` event names it: one of the project's sketchpads. */
export type SketchSheet = `project:${string}`;
export const projectSheet = (id: string): SketchSheet => `project:${id}`;
export const projectSheetId = (sheet: string | undefined): string | null =>
  sheet?.startsWith('project:') ? sheet.slice('project:'.length) : null;

/** One of the project's sketchpads. If it is not there (not yet made, removed, or undone away) an empty one
 * stands in, which nothing is drawn on. */
const projectPads = new Map<string, SketchStore>();
let standIn: Sketch | null = null;
export function projectSketchPad(id: string | null): SketchStore {
  const key = id ?? '';
  let pad = projectPads.get(key);
  if (!pad) {
    pad = {
      get: () =>
        getStore()
          .get()
          .workbook.sketches.find((s) => s.id === id)?.sketch ?? (standIn ??= blankSketch(newId())),
      set: (sketch) => {
        if (id !== null) getStore().drawProjectSketch(id, sketch);
      },
      subscribe: (listener) => getStore().subscribe(listener),
    };
    projectPads.set(key, pad);
  }
  return pad;
}
