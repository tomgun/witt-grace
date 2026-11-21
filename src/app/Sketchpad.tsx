// Luonnoslehtiö (owner 2026-11-20, UI_INVENTORY S-15): free drawing, diagrams, mind maps and frame animation on one
// fixed sheet, apart from the argument tree. The model and every change are in domain/sketch.ts; this module draws
// the frame on a canvas, turns pointer and key input into those changes, keeps undo history and saves the sketch
// to this browser (`witt-sketch-v1`). A sketch leaves the browser only as a file or a picture the person saves.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  SKETCH_COLORS,
  SKETCH_FONT_SIZE,
  SKETCH_HEIGHT,
  SKETCH_LIMITS,
  SKETCH_SIZES,
  SKETCH_WIDTH,
  addChildNode,
  addComment,
  addElement,
  addFrame,
  elementAt,
  elementBounds,
  linkEnds,
  moveElements,
  nodeTextOffset,
  parentNodeId,
  parseSketch,
  removeComment,
  removeElements,
  removeFrame,
  restyle,
  serializeSketch,
  setFps,
  setFrameName,
  setText,
  setTween,
  boxAt,
  textBounds,
  tweenElements,
} from '../domain/sketch.ts';
import type { BoxElement, Sketch, SketchElement, TextElement } from '../domain/sketch.ts';
import { downloadText, pickTextFile } from '../lib/files.ts';
import type { MessageKey } from '../lib/i18n/catalog.ts';
import { applySketchOps, diffSketch } from '../domain/sketchOps.ts';
import { newId } from '../lib/providers.ts';
import { hasDrawing, ownSketch, sharedSketch } from './sketchStore.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

/** The pen a person starts with on the shared sketchpad, by their place in the session; white is left out. */
const seatColor = (place: number): number => Math.max(0, place) % (SKETCH_COLORS.length - 1);
const TOOLS = ['select', 'pen', 'line', 'arrow', 'rect', 'ellipse', 'text', 'node', 'eraser'] as const;
type Tool = (typeof TOOLS)[number];
const TOOL_LABEL: Record<Tool, MessageKey> = {
  select: 'sketchToolSelect',
  pen: 'sketchToolPen',
  line: 'sketchToolLine',
  arrow: 'sketchToolArrow',
  rect: 'sketchToolRect',
  ellipse: 'sketchToolEllipse',
  text: 'sketchToolText',
  node: 'sketchToolNode',
  eraser: 'sketchToolEraser',
};
const TOOL_ICON: Record<Tool, string> = {
  select: '↖',
  pen: '✎',
  line: '╱',
  arrow: '→',
  rect: '▭',
  ellipse: '◯',
  text: 'T',
  node: '▣',
  eraser: '⌫',
};
const TOOL_KEY: Record<string, Tool> = {
  v: 'select',
  p: 'pen',
  l: 'line',
  a: 'arrow',
  r: 'rect',
  e: 'ellipse',
  t: 'text',
  n: 'node',
  x: 'eraser',
};
const FONT = `${SKETCH_FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`;

function draw(ctx: CanvasRenderingContext2D, elements: readonly SketchElement[], alpha: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  for (const el of elements) {
    const color = SKETCH_COLORS[el.color] ?? SKETCH_COLORS[0];
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = el.size;
    switch (el.type) {
      case 'pen': {
        ctx.beginPath();
        ctx.moveTo(el.points[0] as number, el.points[1] as number);
        if (el.points.length === 2) ctx.lineTo((el.points[0] as number) + 0.01, el.points[1] as number);
        for (let i = 2; i + 1 < el.points.length; i += 2)
          ctx.lineTo(el.points[i] as number, el.points[i + 1] as number);
        ctx.stroke();
        break;
      }
      case 'line':
      case 'arrow': {
        ctx.beginPath();
        ctx.moveTo(el.x1, el.y1);
        ctx.lineTo(el.x2, el.y2);
        if (el.type === 'arrow') {
          const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
          const head = 8 + el.size * 2;
          for (const turn of [-0.45, 0.45]) {
            ctx.moveTo(el.x2, el.y2);
            ctx.lineTo(el.x2 - head * Math.cos(angle + turn), el.y2 - head * Math.sin(angle + turn));
          }
        }
        ctx.stroke();
        break;
      }
      case 'link': {
        const ends = linkEnds(el, elements);
        if (!ends) break;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ends.x1, ends.y1);
        ctx.lineTo(ends.x2, ends.y2);
        ctx.stroke();
        break;
      }
      case 'rect':
      case 'ellipse': {
        ctx.beginPath();
        if (el.type === 'rect') ctx.rect(el.x, el.y, el.w, el.h);
        else
          ctx.ellipse(
            el.x + el.w / 2,
            el.y + el.h / 2,
            Math.abs(el.w / 2),
            Math.abs(el.h / 2),
            0,
            0,
            Math.PI * 2
          );
        if (el.fill !== null) {
          ctx.fillStyle = SKETCH_COLORS[el.fill] ?? color;
          ctx.globalAlpha = alpha * 0.3;
          ctx.fill();
          ctx.globalAlpha = alpha;
        }
        ctx.stroke();
        if (el.text) {
          // What is written in a box sits in its middle, line by line.
          const lines = el.text.split('\n');
          const step = SKETCH_FONT_SIZE * 1.3;
          const left = Math.min(el.x, el.x + el.w);
          const top = Math.min(el.y, el.y + el.h);
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          lines.forEach((line, i) =>
            ctx.fillText(
              line,
              left + Math.abs(el.w) / 2,
              top + Math.abs(el.h) / 2 - (lines.length * step) / 2 + i * step + 3
            )
          );
          ctx.textAlign = 'start';
        }
        break;
      }
      case 'text':
      case 'node': {
        const box = textBounds(el);
        let x = el.x;
        let y = el.y;
        if (el.type === 'node') {
          ctx.beginPath();
          ctx.roundRect(box.x, box.y, box.w, box.h, 10);
          // The sheet's own white under the text, so a link ends at the node's edge to the eye.
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          // A node's frame and its links are thin whatever the pen's width: a map is read, not painted.
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = color;
          x += nodeTextOffset.x;
          y += nodeTextOffset.y;
        }
        el.text.split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * SKETCH_FONT_SIZE * 1.3 + 3));
        if (el.type === 'node' && el.comments?.length) {
          // How many comments the node has, on its corner as on a card of the tree.
          ctx.beginPath();
          ctx.arc(box.x + box.w, box.y, 11, 0, Math.PI * 2);
          ctx.fillStyle = '#5251bd';
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold 13px ui-monospace, Menlo, Consolas, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(String(el.comments.length), box.x + box.w, box.y - 6);
          ctx.textAlign = 'start';
          ctx.font = FONT;
        }
        break;
      }
    }
  }
  ctx.restore();
}

export default function Sketchpad({ onClose }: { onClose: () => void }) {
  const t = useTranslator();
  const { collab } = useAppState();
  /** A session is on: the shared sketchpad is drawn on by everyone in it. */
  const live = collab?.phase === 'active' || collab?.phase === 'reconnecting';
  const place = collab ? collab.people.findIndex((p) => p.userId === collab.selfUserId) : -1;
  const [which, setWhich] = useState<'own' | 'shared'>(live ? 'shared' : 'own');
  const pad = which === 'shared' ? sharedSketch : ownSketch;
  const sketch = useSyncExternalStore(pad.subscribe, pad.get);
  const sharing = which === 'shared' && live;
  /** Waiting for the host to come back: what was drawn now would be lost when it does. */
  const waiting = sharing && collab?.phase === 'reconnecting';
  const copyKept = hasDrawing(useSyncExternalStore(sharedSketch.subscribe, sharedSketch.get));
  const [frame, setFrame] = useState(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(() => (live ? seatColor(place) : 0));
  const [size, setSize] = useState<number>(SKETCH_SIZES[1]);
  const [fill, setFill] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingState, setEditing] = useState<{ id: string; created: boolean } | null>(null);
  /** What is on screen while a gesture is under way; it becomes the sketch (one undo step) when the gesture ends. */
  const [preview, setPreview] = useState<Sketch | null>(null);
  const [onion, setOnion] = useState(true);
  const [playing, setPlaying] = useState(false);
  /** While playing with gliding: how far (0…1) the picture is from the frame in view towards the next. */
  const [glide, setGlide] = useState(0);
  const startFrame = useRef(0);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const history = useRef<{ past: Sketch[]; future: Sketch[] }>({ past: [], future: [] });
  // How many steps there are to undo and redo: the buttons read these, the steps themselves stay in the ref.
  const [steps, setSteps] = useState({ past: 0, future: 0 });
  const touch = () => setSteps({ past: history.current.past.length, future: history.current.future.length });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<{
    kind: 'draw' | 'move' | 'erase';
    id: string;
    startX: number;
    startY: number;
    base: Sketch;
  } | null>(null);

  const shown = preview ?? sketch;
  const at = Math.min(frame, shown.frames.length - 1);
  const elements = useMemo(() => shown.frames[at]?.elements ?? [], [shown, at]);
  // What is being written may be removed by someone else in a session: then nothing is being written.
  const editing = editingState && elements.some((e) => e.id === editingState.id) ? editingState : null;

  /**
   * This person's change, from `base` to `next`. It is taken as the operations that make it, so that on a shared
   * sketchpad it lands on top of what others have drawn meanwhile and is told to the session.
   */
  const setSketch = (next: Sketch, base: Sketch = sketch) => {
    const ops = diffSketch(base, next);
    if (!ops.length) return;
    const current = pad.get();
    pad.set(current === base ? next : applySketchOps(current, ops));
    if (!sharing) return;
    const sent = getStore().collabLink()?.session.sketched(ops) ?? true;
    if (!sent) setMessage(t('sketchTooLarge'));
  };
  /** The same, as a step that Kumoa takes back (on the person's own sketchpad). */
  const commit = (next: Sketch, base: Sketch = sketch) => {
    if (next === base) return;
    if (!sharing) {
      history.current.past.push(sketch);
      if (history.current.past.length > 100) history.current.past.shift();
      history.current.future = [];
      touch();
    }
    setSketch(next, base);
  };
  const choose = (next: 'own' | 'shared') => {
    if (next === which) return;
    // Each sketchpad has its own steps to undo; they are not carried from one to the other.
    history.current = { past: [], future: [] };
    touch();
    setPreview(null);
    setEditing(null);
    setSelected([]);
    setFrame(0);
    setPlaying(false);
    setMessage(null);
    if (next === 'shared' && live) setColor(seatColor(place));
    setWhich(next);
  };
  const undo = () => {
    if (sharing) return;
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(sketch);
    setSketch(previous);
    setSelected([]);
    touch();
  };
  const redo = () => {
    if (sharing) return;
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(sketch);
    setSketch(next);
    setSelected([]);
    touch();
  };

  // The frame on the canvas: the sheet, the previous frame faintly, the elements, the selection.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
    if (onion && !playing && at > 0) draw(ctx, shown.frames[at - 1]?.elements ?? [], 0.18);
    if (playing && sketch.tween) {
      const next = shown.frames[(at + 1) % shown.frames.length]?.elements ?? [];
      draw(ctx, tweenElements(elements, next, glide), 1);
    } else draw(ctx, elements, 1);
    if (playing) return;
    ctx.save();
    ctx.strokeStyle = '#5251bd';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    for (const el of elements) {
      if (!selected.includes(el.id)) continue;
      const b = elementBounds(el, elements);
      if (b) ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    }
    ctx.restore();
  }, [shown, at, elements, selected, onion, playing, glide, sketch.tween]);

  // Playing the frames from the one in view: one after another at the sketch's speed, until stopped. With gliding
  // on, the picture is drawn many times a second and `glide` says how far it is on the way to the next frame.
  useEffect(() => {
    if (!playing) return;
    const count = sketch.frames.length;
    const started = performance.now();
    const first = startFrame.current;
    let handle = 0;
    const tick = () => {
      const steps = ((performance.now() - started) / 1000) * sketch.fps;
      setFrame((first + Math.floor(steps)) % count);
      if (sketch.tween) setGlide(steps - Math.floor(steps));
      handle = window.requestAnimationFrame(tick);
    };
    handle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(handle);
  }, [playing, sketch.fps, sketch.frames.length, sketch.tween]);

  const point = (event: { clientX: number; clientY: number }) => {
    const rect = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    const round = (v: number) => Math.round(v * 10) / 10;
    return {
      x: round(
        Math.max(0, Math.min(SKETCH_WIDTH, ((event.clientX - rect.left) * SKETCH_WIDTH) / rect.width))
      ),
      y: round(
        Math.max(0, Math.min(SKETCH_HEIGHT, ((event.clientY - rect.top) * SKETCH_HEIGHT) / rect.height))
      ),
    };
  };

  // Leaving the editor by a key also blurs it: the ref makes sure the text is taken once.
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  const finishEditing = (text: string, then?: 'child' | 'sibling') => {
    const open = editingRef.current;
    if (!open) return;
    editingRef.current = null;
    const { id, created } = open;
    setEditing(null);
    const current = sketch.frames[at]?.elements.find((e) => e.id === id);
    let next = sketch;
    if (current?.type === 'rect' || current?.type === 'ellipse') {
      // A box keeps standing whatever is written in it; an emptied text only takes the writing away.
      next = setText(sketch, at, id, text);
      if (JSON.stringify(next) !== JSON.stringify(sketch)) commit(next);
      setSelected([id]);
      canvasRef.current?.focus();
      return;
    }
    if (!text.trim()) {
      // A text that was never written is not left behind as an empty frame.
      next = removeElements(sketch, at, [id]);
      if (created) {
        // Its creation is not an undo step either.
        history.current.past.pop();
        touch();
        setSketch(next);
        // A child that was not written after all: back on the node it was being added to.
        const parent = parentNodeId(sketch.frames[at]?.elements ?? [], id);
        setSelected(parent ? [parent] : []);
        canvasRef.current?.focus();
        return;
      }
    } else next = setText(sketch, at, id, text);
    if (created) setSketch(next);
    else commit(next);
    setSelected(text.trim() ? [id] : []);
    if (then && text.trim() && current?.type === 'node')
      window.setTimeout(() => growMindMap(id, then, next), 0);
    else canvasRef.current?.focus();
  };

  /** Tab and Enter on a node: a child, or a sibling under the same parent; the new node opens for writing. */
  const growMindMap = (nodeId: string, kind: 'child' | 'sibling', from: Sketch = sketch) => {
    const all = from.frames[at]?.elements ?? [];
    const parent = kind === 'child' ? nodeId : parentNodeId(all, nodeId);
    if (!parent) return;
    const ids = { node: newId(), link: newId() };
    const next = addChildNode(from, at, parent, ids, '');
    if (next === from) return;
    history.current.past.push(from);
    history.current.future = [];
    touch();
    setSketch(next, from);
    setSelected([ids.node]);
    setEditing({ id: ids.node, created: true });
  };

  /** A new text or node at the point, open for writing; one that is left empty is taken away again. */
  const writeAt = (type: 'text' | 'node', x: number, y: number) => {
    const element: TextElement = { id: newId(), color, size, type, x, y, text: '' };
    const next = addElement(sketch, at, element);
    if (next === sketch) return;
    history.current.past.push(sketch);
    history.current.future = [];
    touch();
    setSketch(next);
    setSelected([element.id]);
    setEditing({ id: element.id, created: true });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || playing || waiting) return;
    if (editing) {
      // A press on the sheet takes what was written: the canvas takes the focus, and the editor's blur finishes.
      event.currentTarget.focus({ preventScroll: true });
      return;
    }
    const { x, y } = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    const style = { id: newId(), color, size };
    if (tool === 'select') {
      const hit = elementAt(elements, x, y);
      if (!hit) {
        setSelected([]);
        return;
      }
      const ids = event.shiftKey
        ? selected.includes(hit.id)
          ? selected.filter((id) => id !== hit.id)
          : [...selected, hit.id]
        : selected.includes(hit.id)
          ? selected
          : [hit.id];
      setSelected(ids);
      gesture.current = { kind: 'move', id: hit.id, startX: x, startY: y, base: sketch };
      return;
    }
    if (tool === 'eraser') {
      const hit = elementAt(elements, x, y);
      gesture.current = { kind: 'erase', id: '', startX: x, startY: y, base: sketch };
      if (hit) setPreview(removeElements(sketch, at, [hit.id]));
      return;
    }
    if (tool === 'text' || tool === 'node') {
      // Into a box when the press is inside one; a text of its own anywhere else.
      const box = tool === 'text' ? boxAt(elements, x, y) : null;
      if (box) {
        setSelected([box.id]);
        setEditing({ id: box.id, created: false });
      } else writeAt(tool, x, y);
      return;
    }
    const element: SketchElement =
      tool === 'pen'
        ? { ...style, type: 'pen', points: [x, y] }
        : tool === 'line' || tool === 'arrow'
          ? { ...style, type: tool, x1: x, y1: y, x2: x, y2: y }
          : { ...style, type: tool, x, y, w: 0, h: 0, fill: fill ? color : null };
    setSelected([]);
    gesture.current = { kind: 'draw', id: element.id, startX: x, startY: y, base: sketch };
    setPreview(addElement(sketch, at, element));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g) return;
    const { x, y } = point(event);
    if (g.kind === 'move') {
      if (Math.hypot(x - g.startX, y - g.startY) < 3 && !preview) return;
      setPreview(moveElements(g.base, at, selected, x - g.startX, y - g.startY));
      return;
    }
    if (g.kind === 'erase') {
      const current = preview ?? g.base;
      const hit = elementAt(current.frames[at]?.elements ?? [], x, y);
      if (hit) setPreview(removeElements(current, at, [hit.id]));
      return;
    }
    const current = preview ?? g.base;
    setPreview({
      ...current,
      frames: current.frames.map((f, i) =>
        i !== at
          ? f
          : {
              ...f,
              elements: f.elements.map((el) => {
                if (el.id !== g.id) return el;
                if (el.type === 'pen') {
                  const n = el.points.length;
                  const far =
                    Math.hypot(x - (el.points[n - 2] as number), y - (el.points[n - 1] as number)) >= 1.5;
                  return far && n < SKETCH_LIMITS.points * 2 ? { ...el, points: [...el.points, x, y] } : el;
                }
                if (el.type === 'line' || el.type === 'arrow') return { ...el, x2: x, y2: y };
                if (el.type === 'rect' || el.type === 'ellipse')
                  return { ...el, w: x - g.startX, h: y - g.startY };
                return el;
              }),
            }
      ),
    });
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !preview) {
      setPreview(null);
      return;
    }
    let next = preview;
    if (g.kind === 'draw') {
      const made = next.frames[at]?.elements.find((e) => e.id === g.id);
      const b = made ? elementBounds(made, next.frames[at]?.elements ?? []) : null;
      // A press without a stroke leaves a dot with the pen and nothing with the shape tools.
      if (made && made.type !== 'pen' && (!b || (b.w < 3 && b.h < 3))) next = g.base;
    }
    setPreview(null);
    commit(next, g.base);
  };

  const removeSelected = () => {
    if (!selected.length) return;
    commit(removeElements(sketch, at, selected));
    setSelected([]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (editing || playing || waiting) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (mod && key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (mod || event.altKey) return;
    const only = selected.length === 1 ? elements.find((e) => e.id === selected[0]) : undefined;
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      removeSelected();
    } else if (key === 'Escape') setSelected([]);
    else if (key.startsWith('Arrow') && selected.length) {
      event.preventDefault();
      const step = event.shiftKey ? 40 : 10;
      const [dx, dy] =
        key === 'ArrowLeft'
          ? [-step, 0]
          : key === 'ArrowRight'
            ? [step, 0]
            : key === 'ArrowUp'
              ? [0, -step]
              : [0, step];
      commit(moveElements(sketch, at, selected, dx, dy));
    } else if (only && (only.type === 'node' || only.type === 'text') && key === 'F2') {
      event.preventDefault();
      setEditing({ id: only.id, created: false });
    } else if (
      only &&
      (only.type === 'rect' || only.type === 'ellipse') &&
      (key === 'F2' || key === 'Enter')
    ) {
      event.preventDefault();
      setEditing({ id: only.id, created: false });
    } else if (only?.type === 'node' && key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      growMindMap(only.id, 'child');
    } else if (only?.type === 'node' && key === 'Enter') {
      event.preventDefault();
      if (parentNodeId(elements, only.id)) growMindMap(only.id, 'sibling');
      else setEditing({ id: only.id, created: false });
    } else if (TOOL_KEY[key.toLowerCase()]) setTool(TOOL_KEY[key.toLowerCase()] as Tool);
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = point(event);
    const hit = elementAt(elements, x, y);
    if (playing || editing || waiting) return;
    if (hit && (hit.type === 'text' || hit.type === 'node')) {
      setSelected([hit.id]);
      setEditing({ id: hit.id, created: false });
      return;
    }
    // Into a box: the text is the box's own and moves with it.
    const box = hit?.type === 'rect' || hit?.type === 'ellipse' ? hit : boxAt(elements, x, y);
    if (box) {
      setSelected([box.id]);
      setEditing({ id: box.id, created: false });
      return;
    }
    if (hit || tool !== 'select') return;
    // On the bare sheet with the selection tool: a free text where the press was.
    writeAt('text', x, y);
  };

  const pickStyle = (style: { color?: number; size?: number; fill?: number | null }) => {
    if (selected.length) commit(restyle(sketch, at, selected, style));
  };

  const goToFrame = (next: number) => {
    setSelected([]);
    setFrame(Math.max(0, Math.min(sketch.frames.length - 1, next)));
  };
  const newFrame = (copy: boolean) => {
    const next = addFrame(sketch, at, newId(), copy);
    if (next === sketch) return;
    commit(next);
    setSelected([]);
    setFrame(at + 1);
  };
  const deleteFrame = () => {
    commit(removeFrame(sketch, at));
    setSelected([]);
    setFrame(Math.max(0, Math.min(at, sketch.frames.length - 2)));
  };

  const openFile = async () => {
    const picked = await pickTextFile();
    if (!picked) return;
    const parsed = parseSketch(picked.text);
    if (!parsed.ok) {
      setMessage(t('sketchInvalid', { reason: parsed.reason }));
      return;
    }
    setMessage(null);
    if (sharing) {
      // A file opened onto the shared sketchpad replaces it for everyone; only the host may.
      const link = getStore().collabLink();
      if (link?.role !== 'host') return;
      pad.set(parsed.sketch);
      link.session.sketchReplaced();
    } else commit(parsed.sketch);
    setSelected([]);
    setFrame(0);
  };
  const exportPng = () => {
    const out = document.createElement('canvas');
    out.width = SKETCH_WIDTH;
    out.height = SKETCH_HEIGHT;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
    draw(ctx, sketch.frames[at]?.elements ?? [], 1);
    out.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `witt-sketch-${at + 1}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  };

  const editingElement = editing ? elements.find((e) => e.id === editing.id) : undefined;
  const editorPlace = !editingElement
    ? null
    : editingElement.type === 'text' || editingElement.type === 'node'
      ? textBounds(editingElement)
      : editingElement.type === 'rect' || editingElement.type === 'ellipse'
        ? {
            x: Math.min(editingElement.x, editingElement.x + editingElement.w) + 8,
            y:
              Math.min(editingElement.y, editingElement.y + editingElement.h) +
              Math.abs(editingElement.h) / 2 -
              18,
          }
        : null;
  const editingText =
    editingElement && 'text' in editingElement && typeof editingElement.text === 'string'
      ? editingElement.text
      : '';
  const texts = elements.filter(
    (e): e is TextElement | (BoxElement & { text: string }) =>
      (e.type === 'text' || e.type === 'node' || e.type === 'rect' || e.type === 'ellipse') && !!e.text
  );
  const only = selected.length === 1 ? elements.find((e) => e.id === selected[0]) : undefined;
  /** The node whose comments are shown: the one selected node, while nothing is being written or played. */
  const commented = only?.type === 'node' && !editing && !playing ? only : null;
  const nodeSelected =
    selected.length === 1 && elements.find((e) => e.id === selected[0])?.type === 'node' && !editing;

  return (
    <div className="sketchpad" id="sketchpad" data-testid="sketchpad">
      <header className="sketch-bar">
        <button
          type="button"
          className="btn icon-btn"
          id="btnSketchBack"
          aria-label={t('sketchBack')}
          title={t('sketchBack')}
          onClick={onClose}
        >
          ←
        </button>
        <h1>{t('sketchTitle')}</h1>
        {live || copyKept ? (
          <div className="sketch-which" role="group" aria-label={t('sketchWhich')}>
            <button
              type="button"
              className="btn quiet"
              id="btnSketchOwn"
              aria-pressed={which === 'own'}
              onClick={() => choose('own')}
            >
              {t('sketchOwn')}
            </button>
            <button
              type="button"
              className="btn quiet"
              id="btnSketchShared"
              aria-pressed={which === 'shared'}
              onClick={() => choose('shared')}
            >
              {t(live ? 'sketchShared' : 'sketchSharedCopy')}
            </button>
          </div>
        ) : null}
        <div className="sketch-bar-actions">
          <button
            type="button"
            className="btn quiet"
            id="btnSketchUndo"
            disabled={sharing || !steps.past}
            onClick={undo}
          >
            {t('undo')}
          </button>
          <button
            type="button"
            className="btn quiet"
            id="btnSketchRedo"
            disabled={sharing || !steps.future}
            onClick={redo}
          >
            {t('redo')}
          </button>
          <button
            type="button"
            className="btn quiet"
            id="btnSketchOpen"
            disabled={sharing && collab?.role !== 'host'}
            title={sharing && collab?.role !== 'host' ? t('sketchOpenHostOnly') : undefined}
            onClick={() => void openFile()}
          >
            {t('sketchOpen')}
          </button>
          <button
            type="button"
            className="btn quiet"
            id="btnSketchSave"
            onClick={() => downloadText('sketch.witt-sketch.json', serializeSketch(sketch))}
          >
            {t('sketchSave')}
          </button>
          <button type="button" className="btn quiet" id="btnSketchExport" onClick={exportPng}>
            {t('sketchExport')}
          </button>
        </div>
      </header>
      <main className="sketch-main">
        <div className="sketch-tools" role="toolbar" aria-label={t('sketchTools')}>
          {TOOLS.map((name) => (
            <button
              key={name}
              type="button"
              className={`sketch-tool${tool === name ? ' active' : ''}`}
              data-tool={name}
              aria-pressed={tool === name}
              aria-label={t(TOOL_LABEL[name])}
              title={t(TOOL_LABEL[name])}
              onClick={() => {
                setTool(name);
                if (name !== 'select') setSelected([]);
              }}
            >
              <span aria-hidden="true">{TOOL_ICON[name]}</span>
              <small>{t(TOOL_LABEL[name])}</small>
            </button>
          ))}
          <div className="sketch-swatches" role="group" aria-label={t('sketchColor')}>
            {SKETCH_COLORS.map((value, i) => (
              <button
                key={value}
                type="button"
                className={`sketch-swatch${color === i ? ' active' : ''}`}
                data-color={i}
                style={{ background: value }}
                aria-pressed={color === i}
                aria-label={t('sketchColorN', { n: i + 1 })}
                onClick={() => {
                  setColor(i);
                  pickStyle({ color: i, ...(fill ? { fill: i } : {}) });
                }}
              />
            ))}
          </div>
          <label className="sketch-field">
            <span>{t('sketchSize')}</span>
            <select
              id="sketchSize"
              value={size}
              onChange={(e) => {
                const value = Number(e.target.value);
                setSize(value);
                pickStyle({ size: value });
              }}
            >
              {SKETCH_SIZES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="sketch-check">
            <input
              type="checkbox"
              id="sketchFill"
              checked={fill}
              onChange={(e) => {
                setFill(e.target.checked);
                pickStyle({ fill: e.target.checked ? color : null });
              }}
            />
            <span>{t('sketchFill')}</span>
          </label>
          <button
            type="button"
            className="btn quiet"
            id="btnSketchDelete"
            disabled={!selected.length}
            onClick={removeSelected}
          >
            {t('sketchDeleteSelected')}
          </button>
        </div>
        <div className="sketch-stage">
          <p className="sketch-hint" id="sketchHint" role="status">
            {message ??
              (waiting
                ? t('sketchReconnecting')
                : nodeSelected
                  ? t('sketchNodeHint')
                  : sharing
                    ? t('sketchSharedHint')
                    : which === 'shared'
                      ? t('sketchCopyHint')
                      : t('sketchIntro'))}
          </p>
          {sharing && collab ? (
            <ul className="sketch-people" id="sketchPeople" aria-label={t('sketchPens')}>
              {collab.people.map((person, i) => (
                <li key={person.userId}>
                  <span
                    className="sketch-person-pen"
                    style={{ background: SKETCH_COLORS[seatColor(i)] }}
                    aria-hidden="true"
                  />
                  {person.name}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="sketch-sheet">
            <canvas
              ref={canvasRef}
              id="sketchCanvas"
              width={SKETCH_WIDTH}
              height={SKETCH_HEIGHT}
              tabIndex={0}
              role="img"
              aria-label={t('sketchCanvas', { count: elements.length })}
              aria-describedby="sketchHint sketchTexts"
              data-tool={tool}
              // The canvas takes the focus itself on a press; the browser's own focusing on mousedown would come
              // after a text editor has opened and close it at once.
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={onDoubleClick}
              onKeyDown={onKeyDown}
            />
            {editing && editorPlace ? (
              <textarea
                key={editing.id}
                id="sketchTextEditor"
                className="sketch-text-editor"
                aria-label={t('sketchTextPrompt')}
                defaultValue={editingText}
                autoFocus
                maxLength={SKETCH_LIMITS.text}
                rows={Math.max(1, editingText.split('\n').length)}
                style={{
                  left: `${(editorPlace.x / SKETCH_WIDTH) * 100}%`,
                  top: `${(editorPlace.y / SKETCH_HEIGHT) * 100}%`,
                }}
                onBlur={(e) => finishEditing(e.target.value)}
                onKeyDown={(e) => {
                  const node = editingElement?.type === 'node';
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    finishEditing(editing.created ? '' : editingText);
                  } else if (e.key === 'Enter' && (node ? !e.shiftKey : e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    finishEditing(e.currentTarget.value);
                  } else if (e.key === 'Tab' && node && !e.shiftKey) {
                    e.preventDefault();
                    finishEditing(e.currentTarget.value, 'child');
                  }
                }}
              />
            ) : null}
          </div>
          {/* The same texts for a screen reader, which cannot read a canvas. */}
          <ul className="visually-hidden" id="sketchTexts" aria-label={t('sketchTexts')}>
            {texts.map((el) => (
              <li key={el.id}>
                {el.text}
                {el.type === 'node' && el.comments?.length ? (
                  <ul>
                    {el.comments.map((c) => (
                      <li key={c.id}>{c.body}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {commented ? (
            <section className="sketch-comments" id="sketchComments" aria-labelledby="sketchCommentsTitle">
              <h2 id="sketchCommentsTitle">
                {t('sketchComments')}: <span>{commented.text}</span>
              </h2>
              {commented.comments?.length ? (
                <ul>
                  {commented.comments.map((c) => (
                    <li key={c.id}>
                      <span>{c.body}</span>
                      <button
                        type="button"
                        className="btn icon-btn"
                        aria-label={`${t('deleteComment')}: ${c.body}`}
                        title={t('deleteComment')}
                        onClick={() => commit(removeComment(sketch, at, commented.id, c.id))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t('commentsNone')}</p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commit(addComment(sketch, at, commented.id, { id: newId(), body: comment }));
                  setComment('');
                }}
              >
                <input
                  type="text"
                  id="sketchCommentInput"
                  value={comment}
                  maxLength={SKETCH_LIMITS.text}
                  placeholder={t('sketchCommentPlaceholder')}
                  aria-label={t('sketchCommentPlaceholder')}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button type="submit" className="btn quiet" id="btnSketchComment" disabled={!comment.trim()}>
                  {t('addComment')}
                </button>
              </form>
            </section>
          ) : null}
          {/* The frames by name or number: pages to jump between as well as pictures to play. */}
          <div className="sketch-frame-tabs" id="sketchFrameTabs" role="group" aria-label={t('sketchFrames')}>
            {sketch.frames.map((f, i) => (
              <button
                key={f.id}
                type="button"
                className={`sketch-frame-tab${i === at ? ' active' : ''}`}
                aria-pressed={i === at}
                aria-label={f.name ? undefined : t('sketchFrameTab', { n: i + 1 })}
                disabled={playing}
                onClick={() => goToFrame(i)}
              >
                {f.name ?? i + 1}
              </button>
            ))}
            <input
              type="text"
              id="sketchFrameName"
              key={sketch.frames[at]?.id}
              defaultValue={sketch.frames[at]?.name ?? ''}
              maxLength={SKETCH_LIMITS.frameName}
              placeholder={t('sketchFrameName')}
              aria-label={t('sketchFrameName')}
              disabled={playing}
              onBlur={(e) => {
                if (e.target.value.trim() !== (sketch.frames[at]?.name ?? ''))
                  commit(setFrameName(sketch, at, e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </div>
          <div className="sketch-frames" role="group" aria-label={t('sketchFrames')}>
            <button
              type="button"
              className="btn icon-btn"
              id="btnSketchPrev"
              aria-label={t('sketchFramePrev')}
              title={t('sketchFramePrev')}
              disabled={at === 0 || playing}
              onClick={() => goToFrame(at - 1)}
            >
              ‹
            </button>
            <span id="sketchFrameOf" aria-live="off">
              {t('sketchFrameOf', { current: at + 1, total: sketch.frames.length })}
            </span>
            <button
              type="button"
              className="btn icon-btn"
              id="btnSketchNext"
              aria-label={t('sketchFrameNext')}
              title={t('sketchFrameNext')}
              disabled={at >= sketch.frames.length - 1 || playing}
              onClick={() => goToFrame(at + 1)}
            >
              ›
            </button>
            <button
              type="button"
              className="btn quiet"
              id="btnSketchFrameAdd"
              disabled={playing}
              onClick={() => newFrame(false)}
            >
              {t('sketchFrameAdd')}
            </button>
            <button
              type="button"
              className="btn quiet"
              id="btnSketchFrameCopy"
              disabled={playing}
              onClick={() => newFrame(true)}
            >
              {t('sketchFrameCopy')}
            </button>
            <button
              type="button"
              className="btn quiet"
              id="btnSketchFrameDelete"
              disabled={playing}
              onClick={deleteFrame}
            >
              {sketch.frames.length > 1 ? t('sketchFrameDelete') : t('sketchClear')}
            </button>
            <button
              type="button"
              className={`btn ${playing ? 'primary' : 'quiet'}`}
              id="btnSketchPlay"
              disabled={sketch.frames.length < 2}
              aria-pressed={playing}
              onClick={() => {
                setSelected([]);
                startFrame.current = at;
                setGlide(0);
                setPlaying(!playing);
              }}
            >
              {playing ? t('sketchStop') : t('sketchPlay')}
            </button>
            <label className="sketch-field">
              <span>{t('sketchFps')}</span>
              <select
                id="sketchFps"
                value={sketch.fps}
                onChange={(e) => commit(setFps(sketch, Number(e.target.value)))}
              >
                {[1, 2, 4, 6, 8, 12, 24].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="sketch-check">
              <input
                type="checkbox"
                id="sketchTween"
                checked={!!sketch.tween}
                onChange={(e) => commit(setTween(sketch, e.target.checked))}
              />
              <span>{t('sketchTween')}</span>
            </label>
            <label className="sketch-check">
              <input
                type="checkbox"
                id="sketchOnion"
                checked={onion}
                onChange={(e) => setOnion(e.target.checked)}
              />
              <span>{t('sketchOnion')}</span>
            </label>
          </div>
        </div>
      </main>
    </div>
  );
}
