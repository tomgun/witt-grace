// The two sketchpads a browser keeps (WG-056): the person's own, and the one shared in a collaboration session
// (owner 2026-11-21: a session starts with an empty shared sketchpad, and a copy of it stays here, apart from the
// person's own, when the session ends). Each is read from this browser's storage when first asked for and written
// back on every change; a blocked or full storage leaves it in memory for the visit.
import { blankSketch, parseSketch, serializeSketch } from '../domain/sketch.ts';
import type { Sketch } from '../domain/sketch.ts';
import { newId } from '../lib/providers.ts';
import type { SketchPort } from '../lib/p2p/session.ts';

export const OWN_SKETCH_KEY = 'witt-sketch-v1';
export const SHARED_SKETCH_KEY = 'witt-sketch-session-v1';

export interface SketchStore {
  get(): Sketch;
  set(sketch: Sketch): void;
  subscribe(listener: () => void): () => void;
}

function createSketchStore(key: string): SketchStore {
  let sketch: Sketch | null = null;
  const listeners = new Set<() => void>();
  const load = (): Sketch => {
    try {
      const text = window.localStorage.getItem(key);
      const parsed = text ? parseSketch(text) : null;
      if (parsed?.ok) return parsed.sketch;
    } catch {
      // storage blocked: the sketch lives for this visit only
    }
    return blankSketch(newId());
  };
  return {
    get: () => (sketch ??= load()),
    set(next) {
      if (next === sketch) return;
      sketch = next;
      try {
        window.localStorage.setItem(key, serializeSketch(next));
      } catch {
        // nothing to do: the person can still save a file
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const ownSketch = createSketchStore(OWN_SKETCH_KEY);
export const sharedSketch = createSketchStore(SHARED_SKETCH_KEY);

/** How a session reads and writes the shared sketchpad. */
export const sharedSketchPort: SketchPort = { current: sharedSketch.get, set: sharedSketch.set };
/** A session this browser starts begins on an empty shared sketchpad. */
export const clearSharedSketch = () => sharedSketch.set(blankSketch(newId()));
export const hasDrawing = (sketch: Sketch): boolean =>
  sketch.frames.length > 1 || sketch.frames.some((f) => f.elements.length > 0);
