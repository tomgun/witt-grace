// The canvas camera's decisions as pure functions: where a fit puts the tree, what a wheel event means and how two
// fingers move the view (WG-038, owner 2026-11-19, UI_INVENTORY S-15). Canvas.tsx carries them out.
import { clamp } from '../domain/index.ts';

export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The camera's limits by hand (wheel, buttons, pinch). */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;
/** A fit never enlarges past this. */
const FIT_MAX = 1.15;
/** An automatic fit never shrinks below this: a card's text stays readable and its buttons pressable. */
export const FIT_LEGIBLE = 0.75;
/** "Sovita näkymään" shows the whole tree, down to this. */
export const FIT_WHOLE = 0.3;
const FIT_GAP = 100;
const ANCHOR_MARGIN = 40;

/** Moves one camera axis so that [pos, pos + size] (already scaled) lies inside [margin, extent − margin]; the start
 * wins when the span is longer than the room. */
function keepInside(camera: number, pos: number, size: number, extent: number): number {
  const start = camera + pos;
  if (start < ANCHOR_MARGIN || size > extent - 2 * ANCHOR_MARGIN) return ANCHOR_MARGIN - pos;
  const over = start + size - (extent - ANCHOR_MARGIN);
  return over > 0 ? camera - over : camera;
}

/**
 * The camera that shows `bounds` (the tree) in a viewport: centred and scaled to fit, never below `floor`. When the
 * tree is larger than the view at that scale, the `anchor` card (the selected one: the main claim of an opened
 * document, the card just added) is kept in view instead of the centre, so the person never has to go looking for
 * what they are working on.
 */
export function fitCamera(
  bounds: Rect,
  viewport: { w: number; h: number },
  floor: number,
  anchor: Rect
): Camera {
  const scale = clamp(
    Math.min((viewport.w - FIT_GAP) / bounds.w, (viewport.h - FIT_GAP) / bounds.h),
    floor,
    FIT_MAX
  );
  let x = (viewport.w - bounds.w * scale) / 2 - bounds.x * scale;
  let y = (viewport.h - bounds.h * scale) / 2 - bounds.y * scale;
  if (bounds.w * scale > viewport.w - FIT_GAP)
    x = keepInside(x, anchor.x * scale, anchor.w * scale, viewport.w);
  if (bounds.h * scale > viewport.h - FIT_GAP)
    y = keepInside(y, anchor.y * scale, anchor.h * scale, viewport.h);
  return { x, y, scale };
}

/**
 * The smallest move of the camera that brings a card (world coordinates) wholly into the view with a margin; the
 * same camera when it already is. Used when a card's title editor opens: a card just added is never off screen.
 */
export function revealRect(camera: Camera, rect: Rect, viewport: { w: number; h: number }): Camera {
  const x = keepInside(camera.x, rect.x * camera.scale, rect.w * camera.scale, viewport.w);
  const y = keepInside(camera.y, rect.y * camera.scale, rect.h * camera.scale, viewport.h);
  return x === camera.x && y === camera.y ? camera : { ...camera, x, y };
}

/** Zooms to `nextScale` keeping the world point under the viewport point (px, py) in place. */
export function zoomAt(camera: Camera, nextScale: number, px: number, py: number): Camera {
  const scale = clamp(nextScale, ZOOM_MIN, ZOOM_MAX);
  const wx = (px - camera.x) / camera.scale;
  const wy = (py - camera.y) / camera.scale;
  return { scale, x: px - wx * scale, y: py - wy * scale };
}

export type WheelAction = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };
export interface WheelInput {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages (WheelEvent.deltaMode). */
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}
const LINE_PX = 16;
const PAGE_PX = 400;

/**
 * Scrolling moves the view, as on any page; Ctrl or ⌘ with the wheel zooms, which is also what a trackpad pinch
 * sends. The zoom follows the size of the movement (a trackpad sends many small events, a mouse wheel few large
 * ones) and one event changes the scale by at most a quarter. Shift turns a vertical wheel sideways.
 */
export function wheelAction(e: WheelInput): WheelAction {
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  if (e.ctrlKey || e.metaKey) return { kind: 'zoom', factor: clamp(Math.exp(-dy * 0.01), 0.8, 1.25) };
  if (e.shiftKey && dx === 0) return { kind: 'pan', dx: -dy, dy: 0 };
  return { kind: 'pan', dx: -dx, dy: -dy };
}

export interface Point {
  x: number;
  y: number;
}
/**
 * Two fingers: the view follows their midpoint and scales with their distance. `from` and `to` are the two touch
 * points (viewport coordinates) when the gesture began and now; `start` is the camera when it began.
 */
export function pinchCamera(start: Camera, from: [Point, Point], to: [Point, Point]): Camera {
  const distance = (p: [Point, Point]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  const middle = (p: [Point, Point]): Point => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
  const a = middle(from);
  const b = middle(to);
  const zoomed = zoomAt(start, start.scale * (distance(to) / Math.max(1, distance(from))), a.x, a.y);
  return { scale: zoomed.scale, x: zoomed.x + (b.x - a.x), y: zoomed.y + (b.y - a.y) };
}
