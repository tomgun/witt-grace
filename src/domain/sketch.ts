// Luonnoslehtiö (owner 2026-11-20, UI_INVENTORY S-15): a page for free drawing, diagrams, mind maps and small
// animations, beside the argument tree. This module is its whole model and is pure: a sketch is frames of elements
// on a fixed page, every change is `(sketch, input) → sketch`, and a file is parsed once at the boundary. Nothing
// here knows about GRACE documents; the sketch has its own file format (`witt-sketch`, version 1).

export const SKETCH_FORMAT = 'witt-sketch';
export const SKETCH_VERSION = 1;
/** The page: a fixed sheet, so a sketch looks the same on every screen and in an exported picture. */
export const SKETCH_WIDTH = 1280;
export const SKETCH_HEIGHT = 800;
export const SKETCH_COLORS = [
  '#1f2430',
  '#5251bd',
  '#1f7a5c',
  '#b3404a',
  '#c77d0a',
  '#2b7fb8',
  '#8a8f9c',
  '#ffffff',
] as const;
export const SKETCH_SIZES = [2, 4, 8] as const;
export const SKETCH_FONT_SIZE = 20;
export const SKETCH_LIMITS = {
  frames: 120,
  elements: 2000,
  points: 4000,
  text: 500,
  comments: 50,
  frameName: 40,
  bytes: 5_000_000,
};

interface Styled {
  id: string;
  /** Index into SKETCH_COLORS. */
  color: number;
  /** Stroke width in page units. */
  size: number;
}
export interface PenElement extends Styled {
  type: 'pen';
  /** x0, y0, x1, y1, … */
  points: number[];
}
export interface LineElement extends Styled {
  type: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface BoxElement extends Styled {
  type: 'rect' | 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Index into SKETCH_COLORS, or null for no fill. */
  fill: number | null;
  /** What is written in the box, drawn centred in it; absent when nothing is. */
  text?: string;
}
export interface TextElement extends Styled {
  /** `node` is a mind map node: the same text with a frame round it, and links may end at it. */
  type: 'text' | 'node';
  x: number;
  y: number;
  text: string;
  /** A node's comments, as on a card of the argument tree: questions and notes that are not the node's text. */
  comments?: SketchComment[];
}
export interface SketchComment {
  id: string;
  body: string;
}
/** A mind map link: drawn between two nodes of the same frame wherever they are moved. */
export interface LinkElement extends Styled {
  type: 'link';
  from: string;
  to: string;
}
export type SketchElement = PenElement | LineElement | BoxElement | TextElement | LinkElement;
export interface SketchFrame {
  id: string;
  /** The person's own name for the frame, when the frames are used as pages rather than as an animation. */
  name?: string;
  elements: SketchElement[];
}
export interface Sketch {
  format: typeof SKETCH_FORMAT;
  version: typeof SKETCH_VERSION;
  /** Frames per second when the frames are played. */
  fps: number;
  /** Played with gliding: what is in two consecutive frames moves from its place in one to its place in the next. */
  tween?: boolean;
  frames: SketchFrame[];
}
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const blankSketch = (frameId: string): Sketch => ({
  format: SKETCH_FORMAT,
  version: SKETCH_VERSION,
  fps: 6,
  frames: [{ id: frameId, elements: [] }],
});

function assertNever(value: never): never {
  throw new Error(`Unknown sketch element: ${JSON.stringify(value)}`);
}

// ---- geometry ---------------------------------------------------------------------------------------------------
const NODE_PAD_X = 14;
const NODE_PAD_Y = 9;
/** The text is drawn in a monospace face, so its size is known without measuring: 0.6 em per character. */
export function textBounds(el: TextElement): Bounds {
  const lines = el.text.split('\n');
  const chars = Math.max(1, ...lines.map((line) => [...line].length));
  const w = chars * SKETCH_FONT_SIZE * 0.6;
  const h = lines.length * SKETCH_FONT_SIZE * 1.3;
  return el.type === 'node'
    ? { x: el.x, y: el.y, w: w + 2 * NODE_PAD_X, h: h + 2 * NODE_PAD_Y }
    : { x: el.x, y: el.y, w, h };
}
/** Where a node's text starts inside its frame. */
export const nodeTextOffset = { x: NODE_PAD_X, y: NODE_PAD_Y };

const centre = (b: Bounds) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
/** The two ends of a link, centre to centre; null when an end is missing or is not a node. */
export function linkEnds(
  link: LinkElement,
  elements: readonly SketchElement[]
): { x1: number; y1: number; x2: number; y2: number } | null {
  const from = elements.find((e) => e.id === link.from);
  const to = elements.find((e) => e.id === link.to);
  if (from?.type !== 'node' || to?.type !== 'node') return null;
  const a = centre(textBounds(from));
  const b = centre(textBounds(to));
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function elementBounds(el: SketchElement, elements: readonly SketchElement[]): Bounds | null {
  switch (el.type) {
    case 'pen': {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i + 1 < el.points.length; i += 2) {
        minX = Math.min(minX, el.points[i] as number);
        maxX = Math.max(maxX, el.points[i] as number);
        minY = Math.min(minY, el.points[i + 1] as number);
        maxY = Math.max(maxY, el.points[i + 1] as number);
      }
      return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
    }
    case 'line':
    case 'arrow':
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        w: Math.abs(el.x2 - el.x1),
        h: Math.abs(el.y2 - el.y1),
      };
    case 'rect':
    case 'ellipse':
      return {
        x: Math.min(el.x, el.x + el.w),
        y: Math.min(el.y, el.y + el.h),
        w: Math.abs(el.w),
        h: Math.abs(el.h),
      };
    case 'text':
    case 'node':
      return textBounds(el);
    case 'link': {
      const ends = linkEnds(el, elements);
      return ends
        ? {
            x: Math.min(ends.x1, ends.x2),
            y: Math.min(ends.y1, ends.y2),
            w: Math.abs(ends.x2 - ends.x1),
            h: Math.abs(ends.y2 - ends.y1),
          }
        : null;
    }
    default:
      return assertNever(el);
  }
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** True when the point is on the element: on its stroke, or inside it when it is filled or is text. */
export function hitElement(
  el: SketchElement,
  x: number,
  y: number,
  elements: readonly SketchElement[],
  tolerance = 6
): boolean {
  const reach = tolerance + el.size / 2;
  switch (el.type) {
    case 'pen': {
      if (el.points.length === 2)
        return Math.hypot(x - (el.points[0] as number), y - (el.points[1] as number)) <= reach;
      for (let i = 0; i + 3 < el.points.length; i += 2)
        if (
          distanceToSegment(
            x,
            y,
            el.points[i] as number,
            el.points[i + 1] as number,
            el.points[i + 2] as number,
            el.points[i + 3] as number
          ) <= reach
        )
          return true;
      return false;
    }
    case 'line':
    case 'arrow':
      return distanceToSegment(x, y, el.x1, el.y1, el.x2, el.y2) <= reach;
    case 'link': {
      const ends = linkEnds(el, elements);
      return !!ends && distanceToSegment(x, y, ends.x1, ends.y1, ends.x2, ends.y2) <= reach;
    }
    case 'rect': {
      const b = elementBounds(el, elements) as Bounds;
      const inside = x >= b.x - reach && x <= b.x + b.w + reach && y >= b.y - reach && y <= b.y + b.h + reach;
      if (!inside) return false;
      if (el.fill !== null) return true;
      // An empty rectangle is its outline: pressing in the middle reaches what is drawn inside it.
      return x <= b.x + reach || x >= b.x + b.w - reach || y <= b.y + reach || y >= b.y + b.h - reach;
    }
    case 'ellipse': {
      const b = elementBounds(el, elements) as Bounds;
      const rx = b.w / 2;
      const ry = b.h / 2;
      if (rx === 0 || ry === 0) return false;
      const at = (pad: number) => ((x - b.x - rx) / (rx + pad)) ** 2 + ((y - b.y - ry) / (ry + pad)) ** 2;
      if (at(reach) > 1) return false;
      if (el.fill !== null) return true;
      return rx <= reach || ry <= reach || at(-reach) >= 1;
    }
    case 'text':
    case 'node': {
      const b = textBounds(el);
      return (
        x >= b.x - tolerance &&
        x <= b.x + b.w + tolerance &&
        y >= b.y - tolerance &&
        y <= b.y + b.h + tolerance
      );
    }
    default:
      return assertNever(el);
  }
}

/** The topmost element under the point, or null. Later elements are drawn on top. */
export function elementAt(elements: readonly SketchElement[], x: number, y: number): SketchElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i] as SketchElement;
    if (hitElement(el, x, y, elements)) return el;
  }
  return null;
}

// ---- changes ----------------------------------------------------------------------------------------------------
const withFrame = (
  sketch: Sketch,
  frame: number,
  change: (elements: SketchElement[]) => SketchElement[]
): Sketch => ({
  ...sketch,
  frames: sketch.frames.map((f, i) => (i === frame ? { ...f, elements: change(f.elements) } : f)),
});

export function addElement(sketch: Sketch, frame: number, element: SketchElement): Sketch {
  if ((sketch.frames[frame]?.elements.length ?? Infinity) >= SKETCH_LIMITS.elements) return sketch;
  return withFrame(sketch, frame, (elements) => [...elements, element]);
}

/** Removes the elements, and with a node the links that ended at it. */
export function removeElements(sketch: Sketch, frame: number, ids: readonly string[]): Sketch {
  const gone = new Set(ids);
  return withFrame(sketch, frame, (elements) =>
    elements.filter((e) => !gone.has(e.id) && !(e.type === 'link' && (gone.has(e.from) || gone.has(e.to))))
  );
}

const clampX = (x: number) => Math.round(Math.max(0, Math.min(SKETCH_WIDTH, x)) * 10) / 10;
const clampY = (y: number) => Math.round(Math.max(0, Math.min(SKETCH_HEIGHT, y)) * 10) / 10;

function moved(el: SketchElement, dx: number, dy: number): SketchElement {
  switch (el.type) {
    case 'pen':
      return { ...el, points: el.points.map((v, i) => Math.round((v + (i % 2 === 0 ? dx : dy)) * 10) / 10) };
    case 'line':
    case 'arrow':
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case 'rect':
    case 'ellipse':
    case 'text':
    case 'node':
      return { ...el, x: el.x + dx, y: el.y + dy };
    case 'link':
      return el;
    default:
      return assertNever(el);
  }
}
/** Moves the elements; a link follows its nodes and is never moved by itself. */
export function moveElements(
  sketch: Sketch,
  frame: number,
  ids: readonly string[],
  dx: number,
  dy: number
): Sketch {
  const chosen = new Set(ids);
  return withFrame(sketch, frame, (elements) =>
    elements.map((e) => (chosen.has(e.id) ? moved(e, dx, dy) : e))
  );
}

export function setText(sketch: Sketch, frame: number, id: string, text: string): Sketch {
  const clean = text.replace(/\r/g, '').slice(0, SKETCH_LIMITS.text);
  return withFrame(sketch, frame, (elements) =>
    elements.map((e) => {
      if (e.id !== id) return e;
      if (e.type === 'text' || e.type === 'node') return { ...e, text: clean };
      if (e.type !== 'rect' && e.type !== 'ellipse') return e;
      // A box with nothing written in it carries no text at all.
      const box: BoxElement = { ...e };
      if (clean.trim()) box.text = clean;
      else delete box.text;
      return box;
    })
  );
}

/**
 * The topmost rectangle or ellipse whose area holds the point, filled or not: where a text written "into a box"
 * goes. (`elementAt` reaches an empty box only at its outline, so that what is inside it can be pressed.)
 */
export function boxAt(elements: readonly SketchElement[], x: number, y: number): BoxElement | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i] as SketchElement;
    if (el.type !== 'rect' && el.type !== 'ellipse') continue;
    const b = elementBounds(el, elements) as Bounds;
    if (b.w === 0 || b.h === 0) continue;
    const inside =
      el.type === 'rect'
        ? x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
        : ((x - b.x - b.w / 2) / (b.w / 2)) ** 2 + ((y - b.y - b.h / 2) / (b.h / 2)) ** 2 <= 1;
    if (inside) return el;
  }
  return null;
}

export function restyle(
  sketch: Sketch,
  frame: number,
  ids: readonly string[],
  style: { color?: number; size?: number; fill?: number | null }
): Sketch {
  const chosen = new Set(ids);
  return withFrame(sketch, frame, (elements) =>
    elements.map((e) => {
      if (!chosen.has(e.id)) return e;
      const next = { ...e, color: style.color ?? e.color, size: style.size ?? e.size };
      return (next.type === 'rect' || next.type === 'ellipse') && style.fill !== undefined
        ? { ...next, fill: style.fill }
        : next;
    })
  );
}

/**
 * A mind map node attached to another: placed to the right of its parent, below the parent's lowest child, and
 * linked to it. `ids` are the new node's and the new link's.
 */
export function addChildNode(
  sketch: Sketch,
  frame: number,
  parentId: string,
  ids: { node: string; link: string },
  text: string
): Sketch {
  const elements = sketch.frames[frame]?.elements ?? [];
  const parent = elements.find((e) => e.id === parentId);
  if (parent?.type !== 'node') return sketch;
  const box = textBounds(parent);
  const children = elements
    .filter((e): e is LinkElement => e.type === 'link' && e.from === parentId)
    .map((link) => elements.find((e) => e.id === link.to))
    .filter((e): e is TextElement => e?.type === 'node');
  const below = children.length ? Math.max(...children.map((c) => c.y + textBounds(c).h)) + 16 : parent.y;
  const node: TextElement = {
    type: 'node',
    id: ids.node,
    color: parent.color,
    size: parent.size,
    x: clampX(box.x + box.w + 70),
    y: clampY(below),
    text,
  };
  const link: LinkElement = {
    type: 'link',
    id: ids.link,
    color: parent.color,
    size: parent.size,
    from: parentId,
    to: ids.node,
  };
  // The link first: it is drawn under the nodes it joins.
  return withFrame(sketch, frame, (all) =>
    all.length + 2 > SKETCH_LIMITS.elements ? all : [link, ...all, node]
  );
}

/** The node a node hangs from, or null for a node that is not anyone's child. */
export function parentNodeId(elements: readonly SketchElement[], nodeId: string): string | null {
  const link = elements.find((e): e is LinkElement => e.type === 'link' && e.to === nodeId);
  return link ? link.from : null;
}

// ---- frames -----------------------------------------------------------------------------------------------------
/**
 * A new frame after the given one: empty, or a copy of it. A copied element keeps its id (ids are unique within a
 * frame, not across frames): that is how the same thing is recognised in the next frame when the frames are played
 * with gliding in between.
 */
export function addFrame(sketch: Sketch, after: number, frameId: string, copy: boolean): Sketch {
  if (sketch.frames.length >= SKETCH_LIMITS.frames) return sketch;
  const elements: SketchElement[] = copy ? [...(sketch.frames[after]?.elements ?? [])] : [];
  const frames = [...sketch.frames];
  frames.splice(after + 1, 0, { id: frameId, elements });
  return { ...sketch, frames };
}

/** Removes a frame; the last one left is emptied instead, so a sketch always has a frame. */
export function removeFrame(sketch: Sketch, frame: number): Sketch {
  if (sketch.frames.length <= 1) return withFrame(sketch, 0, () => []);
  return { ...sketch, frames: sketch.frames.filter((_, i) => i !== frame) };
}

/** Names a frame; an empty name takes the name away and the frame goes by its number again. */
export function setFrameName(sketch: Sketch, frame: number, name: string): Sketch {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, SKETCH_LIMITS.frameName);
  return {
    ...sketch,
    frames: sketch.frames.map((f, i) => {
      if (i !== frame) return f;
      const rest = { ...f };
      delete rest.name;
      return clean ? { ...rest, name: clean } : rest;
    }),
  };
}

/** Adds a comment to a node; an empty one, or one past the limit, changes nothing. */
export function addComment(sketch: Sketch, frame: number, nodeId: string, comment: SketchComment): Sketch {
  const body = comment.body.replace(/\r/g, '').trim().slice(0, SKETCH_LIMITS.text);
  const target = sketch.frames[frame]?.elements.find((e) => e.id === nodeId);
  if (!body || target?.type !== 'node' || (target.comments?.length ?? 0) >= SKETCH_LIMITS.comments)
    return sketch;
  return withFrame(sketch, frame, (elements) =>
    elements.map((e) =>
      e === target ? { ...target, comments: [...(target.comments ?? []), { id: comment.id, body }] } : e
    )
  );
}
export function removeComment(sketch: Sketch, frame: number, nodeId: string, commentId: string): Sketch {
  return withFrame(sketch, frame, (elements) =>
    elements.map((e) => {
      if (e.id !== nodeId || e.type !== 'node' || !e.comments) return e;
      const comments = e.comments.filter((c) => c.id !== commentId);
      const rest = { ...e };
      delete rest.comments;
      return comments.length ? { ...rest, comments } : rest;
    })
  );
}

export function setTween(sketch: Sketch, tween: boolean): Sketch {
  const rest = { ...sketch };
  delete rest.tween;
  return tween ? { ...rest, tween: true } : rest;
}

const lerp = (a: number, b: number, t: number) => Math.round((a + (b - a) * t) * 10) / 10;
/**
 * The frame in between: every element of `from` that is also in `to` (the same id and kind) is drawn `t` of the way
 * (0…1) from its place and size in one to those in the other. A stroke glides when it has as many points in both.
 * What is only in `from` stays as it is until the next frame takes over; what is only in `to` appears then.
 */
export function tweenElements(
  from: readonly SketchElement[],
  to: readonly SketchElement[],
  t: number
): SketchElement[] {
  const next = new Map(to.map((e) => [e.id, e]));
  return from.map((a) => {
    const b = next.get(a.id);
    if (!b) return a;
    if (a.type === 'pen' && b.type === 'pen')
      return a.points.length === b.points.length
        ? { ...a, points: a.points.map((v, i) => lerp(v, b.points[i] as number, t)) }
        : a;
    if ((a.type === 'line' || a.type === 'arrow') && (b.type === 'line' || b.type === 'arrow'))
      return {
        ...a,
        x1: lerp(a.x1, b.x1, t),
        y1: lerp(a.y1, b.y1, t),
        x2: lerp(a.x2, b.x2, t),
        y2: lerp(a.y2, b.y2, t),
      };
    if ((a.type === 'rect' || a.type === 'ellipse') && (b.type === 'rect' || b.type === 'ellipse'))
      return { ...a, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
    if ((a.type === 'text' || a.type === 'node') && (b.type === 'text' || b.type === 'node'))
      return { ...a, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    return a;
  });
}

export const setFps = (sketch: Sketch, fps: number): Sketch => ({
  ...sketch,
  fps: Math.max(1, Math.min(24, Math.round(fps) || 1)),
});

// ---- the file ---------------------------------------------------------------------------------------------------
export const serializeSketch = (sketch: Sketch): string => `${JSON.stringify(sketch)}\n`;

export type SketchParse = { ok: true; sketch: Sketch } | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const FAR = 100_000;

/** One element as it comes from a file or from another person in a session: the element, or the place that is wrong. */
export function parseElement(raw: unknown, path: string): SketchElement | string {
  if (!isObject(raw)) return `${path}: not an object`;
  const { id, color, size, type } = raw;
  if (typeof id !== 'string' || !id || id.length > 80) return `${path}.id`;
  if (!Number.isInteger(color) || !num(color, 0, SKETCH_COLORS.length - 1)) return `${path}.color`;
  if (!num(size, 1, 40)) return `${path}.size`;
  const base = { id, color, size };
  const xy = (keys: string[]) => keys.every((k) => num(raw[k], -FAR, FAR));
  switch (type) {
    case 'pen': {
      const points = raw.points;
      if (
        !Array.isArray(points) ||
        points.length < 2 ||
        points.length % 2 !== 0 ||
        points.length > SKETCH_LIMITS.points * 2 ||
        !points.every((p) => num(p, -FAR, FAR))
      )
        return `${path}.points`;
      return { ...base, type, points: points as number[] };
    }
    case 'line':
    case 'arrow':
      if (!xy(['x1', 'y1', 'x2', 'y2'])) return `${path}: coordinates`;
      return {
        ...base,
        type,
        x1: raw.x1 as number,
        y1: raw.y1 as number,
        x2: raw.x2 as number,
        y2: raw.y2 as number,
      };
    case 'rect':
    case 'ellipse': {
      if (!xy(['x', 'y', 'w', 'h'])) return `${path}: coordinates`;
      const fill = raw.fill ?? null;
      if (fill !== null && !(Number.isInteger(fill) && num(fill, 0, SKETCH_COLORS.length - 1)))
        return `${path}.fill`;
      if (raw.text !== undefined && !(typeof raw.text === 'string' && raw.text.length <= SKETCH_LIMITS.text))
        return `${path}.text`;
      return {
        ...base,
        type,
        x: raw.x as number,
        y: raw.y as number,
        w: raw.w as number,
        h: raw.h as number,
        fill,
        ...(raw.text ? { text: raw.text } : {}),
      };
    }
    case 'text':
    case 'node':
      if (!xy(['x', 'y'])) return `${path}: coordinates`;
      if (typeof raw.text !== 'string' || raw.text.length > SKETCH_LIMITS.text) return `${path}.text`;
      if (raw.comments === undefined)
        return { ...base, type, x: raw.x as number, y: raw.y as number, text: raw.text };
      {
        const list = raw.comments;
        if (type !== 'node' || !Array.isArray(list) || !list.length || list.length > SKETCH_LIMITS.comments)
          return `${path}.comments`;
        const comments: SketchComment[] = [];
        for (const [c, item] of list.entries()) {
          if (
            !isObject(item) ||
            typeof item.id !== 'string' ||
            !item.id ||
            item.id.length > 80 ||
            comments.some((x) => x.id === item.id) ||
            typeof item.body !== 'string' ||
            !item.body ||
            item.body.length > SKETCH_LIMITS.text
          )
            return `${path}.comments[${c}]`;
          comments.push({ id: item.id, body: item.body });
        }
        return { ...base, type, x: raw.x as number, y: raw.y as number, text: raw.text, comments };
      }
    case 'link':
      if (typeof raw.from !== 'string' || typeof raw.to !== 'string') return `${path}: ends`;
      return { ...base, type, from: raw.from, to: raw.to };
    default:
      return `${path}.type`;
  }
}

/** Reads a sketch file. Anything unexpected refuses the whole file and names the place. */
export function parseSketch(text: string): SketchParse {
  if (text.length > SKETCH_LIMITS.bytes) return { ok: false, reason: 'size' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!isObject(raw) || raw.format !== SKETCH_FORMAT) return { ok: false, reason: 'format' };
  if (raw.version !== SKETCH_VERSION) return { ok: false, reason: 'version' };
  if (!num(raw.fps, 1, 24)) return { ok: false, reason: 'fps' };
  if (raw.tween !== undefined && raw.tween !== true) return { ok: false, reason: 'tween' };
  if (!Array.isArray(raw.frames) || raw.frames.length < 1 || raw.frames.length > SKETCH_LIMITS.frames)
    return { ok: false, reason: 'frames' };
  const frames: SketchFrame[] = [];
  const frameIds = new Set<string>();
  for (const [f, frame] of raw.frames.entries()) {
    const at = `frames[${f}]`;
    if (!isObject(frame) || typeof frame.id !== 'string' || !frame.id || frameIds.has(frame.id))
      return { ok: false, reason: `${at}.id` };
    frameIds.add(frame.id);
    if (!Array.isArray(frame.elements) || frame.elements.length > SKETCH_LIMITS.elements)
      return { ok: false, reason: `${at}.elements` };
    const elements: SketchElement[] = [];
    const ids = new Set<string>();
    for (const [e, element] of frame.elements.entries()) {
      const parsed = parseElement(element, `${at}.elements[${e}]`);
      if (typeof parsed === 'string') return { ok: false, reason: parsed };
      if (ids.has(parsed.id)) return { ok: false, reason: `${at}.elements[${e}].id` };
      ids.add(parsed.id);
      elements.push(parsed);
    }
    // A link whose end is not a node of the same frame has nothing to be drawn between.
    for (const [e, element] of elements.entries())
      if (element.type === 'link' && !linkEnds(element, elements))
        return { ok: false, reason: `${at}.elements[${e}]: ends` };
    if (frame.name === undefined) frames.push({ id: frame.id, elements });
    else if (typeof frame.name === 'string' && frame.name && frame.name.length <= SKETCH_LIMITS.frameName)
      frames.push({ id: frame.id, name: frame.name, elements });
    else return { ok: false, reason: `${at}.name` };
  }
  return {
    ok: true,
    sketch: {
      format: SKETCH_FORMAT,
      version: SKETCH_VERSION,
      fps: Math.round(raw.fps),
      ...(raw.tween ? { tween: true as const } : {}),
      frames,
    },
  };
}
