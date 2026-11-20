// Luonnoslehtiö (owner 2026-11-20, UI_INVENTORY S-15): free drawing, diagrams, mind maps and frame animation on one
// fixed sheet, apart from the argument tree. The model and every change are in domain/sketch.ts; this module draws
// the frame on a canvas, turns pointer and key input into those changes, keeps undo history and saves the sketch
// to this browser (`witt-sketch-v1`). A sketch leaves the browser only as a file or a picture the person saves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SKETCH_COLORS,
  SKETCH_FONT_SIZE,
  SKETCH_HEIGHT,
  SKETCH_LIMITS,
  SKETCH_SIZES,
  SKETCH_WIDTH,
  addChildNode,
  addElement,
  addFrame,
  blankSketch,
  elementAt,
  elementBounds,
  linkEnds,
  moveElements,
  nodeTextOffset,
  parentNodeId,
  parseSketch,
  removeElements,
  removeFrame,
  restyle,
  serializeSketch,
  setFps,
  setText,
  textBounds,
} from '../domain/sketch.ts';
import type { Sketch, SketchElement, TextElement } from '../domain/sketch.ts';
import { downloadText, pickTextFile } from '../lib/files.ts';
import type { MessageKey } from '../lib/i18n/catalog.ts';
import { newId } from '../lib/providers.ts';
import { useTranslator } from './store.ts';

const STORAGE_KEY = 'witt-sketch-v1';
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

function loadSaved(): Sketch {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    const parsed = text ? parseSketch(text) : null;
    if (parsed?.ok) return parsed.sketch;
  } catch {
    // storage blocked: the sketch lives for this visit only
  }
  return blankSketch(newId());
}

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
        break;
      }
    }
  }
  ctx.restore();
}

export default function Sketchpad({ onClose }: { onClose: () => void }) {
  const t = useTranslator();
  const [sketch, setSketch] = useState<Sketch>(loadSaved);
  const [frame, setFrame] = useState(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(0);
  const [size, setSize] = useState<number>(SKETCH_SIZES[1]);
  const [fill, setFill] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; created: boolean } | null>(null);
  /** What is on screen while a gesture is under way; it becomes the sketch (one undo step) when the gesture ends. */
  const [preview, setPreview] = useState<Sketch | null>(null);
  const [onion, setOnion] = useState(true);
  const [playing, setPlaying] = useState(false);
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

  const commit = useCallback(
    (next: Sketch) => {
      if (next === sketch) return;
      history.current.past.push(sketch);
      if (history.current.past.length > 100) history.current.past.shift();
      history.current.future = [];
      setSketch(next);
      touch();
    },
    [sketch]
  );
  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(sketch);
    setSketch(previous);
    setSelected([]);
    touch();
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(sketch);
    setSketch(next);
    setSelected([]);
    touch();
  };

  // Saved to this browser on every change; a full or blocked storage leaves the sketch in memory.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeSketch(sketch));
    } catch {
      // nothing to do: the person can still save a file
    }
  }, [sketch]);

  // The frame on the canvas: the sheet, the previous frame faintly, the elements, the selection.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
    if (onion && !playing && at > 0) draw(ctx, shown.frames[at - 1]?.elements ?? [], 0.18);
    draw(ctx, elements, 1);
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
  }, [shown, at, elements, selected, onion, playing]);

  // Playing the frames: one after another at the sketch's speed, until stopped.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setFrame((f) => (f + 1) % sketch.frames.length),
      1000 / sketch.fps
    );
    return () => window.clearInterval(timer);
  }, [playing, sketch.fps, sketch.frames.length]);

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
    if (!text.trim()) {
      // A text that was never written is not left behind as an empty frame.
      next = removeElements(sketch, at, [id]);
      if (created) {
        // Its creation is not an undo step either.
        history.current.past.pop();
        touch();
        setSketch(next);
        setSelected([]);
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
    setSketch(next);
    setSelected([ids.node]);
    setEditing({ id: ids.node, created: true });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || playing || editing) return;
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
      const element: TextElement = { ...style, type: tool, x, y, text: '' };
      const next = addElement(sketch, at, element);
      if (next === sketch) return;
      history.current.past.push(sketch);
      history.current.future = [];
      touch();
      setSketch(next);
      setSelected([element.id]);
      setEditing({ id: element.id, created: true });
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
    commit(next);
  };

  const removeSelected = () => {
    if (!selected.length) return;
    commit(removeElements(sketch, at, selected));
    setSelected([]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (editing || playing) return;
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
    if (hit && (hit.type === 'text' || hit.type === 'node')) {
      setSelected([hit.id]);
      setEditing({ id: hit.id, created: false });
    }
  };

  const pickStyle = (style: { color?: number; size?: number; fill?: number | null }) => {
    if (selected.length) commit(restyle(sketch, at, selected, style));
  };

  const goToFrame = (next: number) => {
    setSelected([]);
    setFrame(Math.max(0, Math.min(sketch.frames.length - 1, next)));
  };
  const newFrame = (copy: boolean) => {
    const next = addFrame(sketch, at, newId(), copy ? { newId } : null);
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
    commit(parsed.sketch);
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
  const editorPlace =
    editingElement && (editingElement.type === 'text' || editingElement.type === 'node')
      ? textBounds(editingElement)
      : null;
  const texts = elements.filter(
    (e): e is TextElement => (e.type === 'text' || e.type === 'node') && !!e.text
  );
  const nodeSelected =
    selected.length === 1 && elements.find((e) => e.id === selected[0])?.type === 'node' && !editing;

  return (
    <div className="sketchpad" id="sketchpad" data-testid="sketchpad">
      <header className="sketch-bar">
        <button
          type="button"
          className="btn icon-btn"
          id="btnSketchBack"
          aria-label={t('homeBack')}
          title={t('homeBack')}
          onClick={onClose}
        >
          ⌂
        </button>
        <h1>{t('sketchTitle')}</h1>
        <div className="sketch-bar-actions">
          <button
            type="button"
            className="btn quiet"
            id="btnSketchUndo"
            disabled={!steps.past}
            onClick={undo}
          >
            {t('undo')}
          </button>
          <button
            type="button"
            className="btn quiet"
            id="btnSketchRedo"
            disabled={!steps.future}
            onClick={redo}
          >
            {t('redo')}
          </button>
          <button type="button" className="btn quiet" id="btnSketchOpen" onClick={() => void openFile()}>
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
            {message ?? (nodeSelected ? t('sketchNodeHint') : t('sketchIntro'))}
          </p>
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
                defaultValue={(editingElement as TextElement).text}
                autoFocus
                maxLength={SKETCH_LIMITS.text}
                rows={Math.max(1, (editingElement as TextElement).text.split('\n').length)}
                style={{
                  left: `${(editorPlace.x / SKETCH_WIDTH) * 100}%`,
                  top: `${(editorPlace.y / SKETCH_HEIGHT) * 100}%`,
                }}
                onBlur={(e) => finishEditing(e.target.value)}
                onKeyDown={(e) => {
                  const node = editingElement?.type === 'node';
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    finishEditing(editing.created ? '' : (editingElement as TextElement).text);
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
              <li key={el.id}>{el.text}</li>
            ))}
          </ul>
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
