// Sketching together (owner 2026-11-21, WG-056): the changes people send one another in a session. A change is a
// small operation on a frame named by its id, never a whole sketch, so two people drawing at once do not undo one
// another: the host puts the operations in one order and everyone applies them in that order. `put` replaces a whole
// element, so of two people changing the same element the later one in the host's order stands.
import {
  SKETCH_LIMITS,
  linkEnds,
  parseElement,
  removeElements,
  setFps,
  setFrameName,
  setTween,
} from './sketch.ts';
import type { Sketch, SketchElement, SketchFrame } from './sketch.ts';

export type SketchOp =
  /** Adds the elements, or replaces the ones with the same ids where they stand. */
  | { op: 'put'; frame: string; elements: SketchElement[] }
  | { op: 'drop'; frame: string; ids: string[] }
  /**
   * A new, empty frame after the named one (`null`: first). A copied frame's content follows as a `put`: "what the
   * other frame holds" would be read differently by two people who have not yet seen each other's last change.
   */
  | { op: 'frameAdd'; id: string; after: string | null }
  | { op: 'frameDrop'; id: string }
  /** An empty name takes the name away. */
  | { op: 'frameName'; id: string; name: string }
  | { op: 'settings'; fps?: number; tween?: boolean };

/** How many operations one message may carry. */
export const MAX_SKETCH_OPS = 200;

const indexOfFrame = (sketch: Sketch, id: string): number => sketch.frames.findIndex((f) => f.id === id);

/**
 * Applies one operation. What cannot be applied (a frame that is gone, a limit reached) changes nothing and returns
 * the same sketch, so the caller can tell. The result always passes `parseSketch`: ids stay unique within a frame and
 * a link whose node is missing is not kept.
 */
export function applySketchOp(sketch: Sketch, op: SketchOp): Sketch {
  switch (op.op) {
    case 'put': {
      const at = indexOfFrame(sketch, op.frame);
      if (at < 0 || !op.elements.length) return sketch;
      const incoming = new Map(op.elements.map((e) => [e.id, e]));
      const before = (sketch.frames[at] as SketchFrame).elements;
      const standing = before.map((e) => {
        const next = incoming.get(e.id);
        if (next) incoming.delete(e.id);
        return next ?? e;
      });
      // A new link goes under everything, as a mind map's links are drawn; anything else new goes on top.
      const fresh = [...incoming.values()];
      const merged = [
        ...fresh.filter((e) => e.type === 'link'),
        ...standing,
        ...fresh.filter((e) => e.type !== 'link'),
      ];
      if (merged.length > SKETCH_LIMITS.elements) return sketch;
      const elements = merged.filter((e) => e.type !== 'link' || linkEnds(e, merged));
      return { ...sketch, frames: sketch.frames.map((f, i) => (i === at ? { ...f, elements } : f)) };
    }
    case 'drop': {
      const at = indexOfFrame(sketch, op.frame);
      if (at < 0) return sketch;
      const frame = sketch.frames[at] as SketchFrame;
      if (!frame.elements.some((e) => op.ids.includes(e.id))) return sketch;
      return removeElements(sketch, at, op.ids);
    }
    case 'frameAdd': {
      if (sketch.frames.length >= SKETCH_LIMITS.frames || indexOfFrame(sketch, op.id) >= 0) return sketch;
      const after = op.after === null ? -1 : indexOfFrame(sketch, op.after);
      const frames = [...sketch.frames];
      const place = op.after !== null && after < 0 ? frames.length : after + 1;
      frames.splice(place, 0, { id: op.id, elements: [] });
      return { ...sketch, frames };
    }
    case 'frameDrop': {
      const at = indexOfFrame(sketch, op.id);
      if (at < 0) return sketch;
      // The last frame left is emptied instead: a sketch always has a frame.
      if (sketch.frames.length <= 1) {
        const only = sketch.frames[0] as SketchFrame;
        return only.elements.length ? { ...sketch, frames: [{ ...only, elements: [] }] } : sketch;
      }
      return { ...sketch, frames: sketch.frames.filter((_, i) => i !== at) };
    }
    case 'frameName': {
      const at = indexOfFrame(sketch, op.id);
      return at < 0 ? sketch : setFrameName(sketch, at, op.name);
    }
    case 'settings': {
      let next = sketch;
      if (op.fps !== undefined && op.fps !== sketch.fps) next = setFps(next, op.fps);
      if (op.tween !== undefined && op.tween !== !!sketch.tween) next = setTween(next, op.tween);
      return next;
    }
    default:
      return assertNever(op);
  }
}
function assertNever(value: never): never {
  throw new Error(`unexpected sketch operation: ${JSON.stringify(value)}`);
}

export const applySketchOps = (sketch: Sketch, ops: readonly SketchOp[]): Sketch =>
  ops.reduce(applySketchOp, sketch);

/**
 * The operations that turn `before` into `after`, for one person's own change: applied to `before` they give
 * `after`, and applied to a sketch others have changed meanwhile they change only what this person changed.
 * Elements are compared by identity: the model's functions keep an untouched element as the same object.
 */
export function diffSketch(before: Sketch, after: Sketch): SketchOp[] {
  if (before === after) return [];
  const ops: SketchOp[] = [];
  if (before.fps !== after.fps || !!before.tween !== !!after.tween)
    ops.push({
      op: 'settings',
      ...(before.fps !== after.fps ? { fps: after.fps } : {}),
      ...(!!before.tween !== !!after.tween ? { tween: !!after.tween } : {}),
    });
  const old = new Map(before.frames.map((f) => [f.id, f]));
  const kept = new Set(after.frames.map((f) => f.id));
  for (const frame of before.frames) if (!kept.has(frame.id)) ops.push({ op: 'frameDrop', id: frame.id });
  after.frames.forEach((frame, i) => {
    const was = old.get(frame.id);
    if (!was) {
      const previous = after.frames[i - 1];
      ops.push({ op: 'frameAdd', id: frame.id, after: previous ? previous.id : null });
      if (frame.elements.length) ops.push({ op: 'put', frame: frame.id, elements: frame.elements });
      if (frame.name) ops.push({ op: 'frameName', id: frame.id, name: frame.name });
      return;
    }
    if ((was.name ?? '') !== (frame.name ?? ''))
      ops.push({ op: 'frameName', id: frame.id, name: frame.name ?? '' });
    if (was.elements === frame.elements) return;
    const wasById = new Map(was.elements.map((e) => [e.id, e]));
    const now = new Set(frame.elements.map((e) => e.id));
    const gone = was.elements.filter((e) => !now.has(e.id)).map((e) => e.id);
    const changed = frame.elements.filter((e) => wasById.get(e.id) !== e);
    if (gone.length) ops.push({ op: 'drop', frame: frame.id, ids: gone });
    if (changed.length) ops.push({ op: 'put', frame: frame.id, elements: changed });
  });
  return ops;
}

/**
 * The operations in groups that each fit one message of `maxChars` (as JSON): a `put` of many elements is cut into
 * smaller ones, nodes before the links between them. One element larger than a message stays alone in its group; the
 * sender sees its size and refuses it.
 */
export function packSketchOps(ops: readonly SketchOp[], maxChars: number): SketchOp[][] {
  const single: { op: SketchOp; size: number }[] = [];
  for (const op of ops) {
    const size = JSON.stringify(op).length;
    if (op.op !== 'put' || size <= maxChars) {
      single.push({ op, size });
      continue;
    }
    const ordered = [...op.elements].sort((a, b) => Number(a.type === 'link') - Number(b.type === 'link'));
    let part: SketchElement[] = [];
    let partSize = 0;
    const flush = () => {
      if (!part.length) return;
      const piece: SketchOp = { op: 'put', frame: op.frame, elements: part };
      single.push({ op: piece, size: JSON.stringify(piece).length });
      part = [];
      partSize = 0;
    };
    for (const element of ordered) {
      const elementSize = JSON.stringify(element).length + 1;
      if (part.length && partSize + elementSize + 80 > maxChars) flush();
      part.push(element);
      partSize += elementSize;
    }
    flush();
  }
  const groups: SketchOp[][] = [];
  let group: SketchOp[] = [];
  let groupSize = 0;
  for (const { op, size } of single) {
    if (group.length && (groupSize + size + 1 > maxChars || group.length >= MAX_SKETCH_OPS)) {
      groups.push(group);
      group = [];
      groupSize = 0;
    }
    group.push(op);
    groupSize += size + 1;
  }
  if (group.length) groups.push(group);
  return groups;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 80;

/** The operations another person sent, checked: every element by the file parser's rules. Anything odd refuses all. */
export function parseSketchOps(raw: unknown): SketchOp[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_SKETCH_OPS) return null;
  const ops: SketchOp[] = [];
  for (const item of raw) {
    if (!isObject(item)) return null;
    switch (item.op) {
      case 'put': {
        if (!isId(item.frame) || !Array.isArray(item.elements)) return null;
        if (!item.elements.length || item.elements.length > SKETCH_LIMITS.elements) return null;
        const elements: SketchElement[] = [];
        const ids = new Set<string>();
        for (const element of item.elements) {
          const parsed = parseElement(element, 'element');
          if (typeof parsed === 'string' || ids.has(parsed.id)) return null;
          ids.add(parsed.id);
          elements.push(parsed);
        }
        ops.push({ op: 'put', frame: item.frame, elements });
        break;
      }
      case 'drop':
        if (!isId(item.frame) || !Array.isArray(item.ids)) return null;
        if (!item.ids.length || item.ids.length > SKETCH_LIMITS.elements || !item.ids.every(isId))
          return null;
        ops.push({ op: 'drop', frame: item.frame, ids: item.ids as string[] });
        break;
      case 'frameAdd':
        if (!isId(item.id) || !(item.after === null || isId(item.after))) return null;
        ops.push({ op: 'frameAdd', id: item.id, after: item.after });
        break;
      case 'frameDrop':
        if (!isId(item.id)) return null;
        ops.push({ op: 'frameDrop', id: item.id });
        break;
      case 'frameName':
        if (!isId(item.id) || typeof item.name !== 'string' || item.name.length > SKETCH_LIMITS.frameName)
          return null;
        ops.push({ op: 'frameName', id: item.id, name: item.name });
        break;
      case 'settings': {
        const { fps, tween } = item;
        if (fps !== undefined && !(Number.isInteger(fps) && (fps as number) >= 1 && (fps as number) <= 24))
          return null;
        if (tween !== undefined && typeof tween !== 'boolean') return null;
        if (fps === undefined && tween === undefined) return null;
        ops.push({
          op: 'settings',
          ...(fps !== undefined ? { fps: fps as number } : {}),
          ...(tween !== undefined ? { tween } : {}),
        });
        break;
      }
      default:
        return null;
    }
  }
  return ops;
}
