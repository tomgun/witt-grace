// The tree as cards on a pannable, zoomable surface, matching the prototype card by card (inv-canvas §1–§8).
// The camera is local; positions come from the frame; a drag ends in one command; nothing here edits scores.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  CARD_W,
  clamp,
  documentPosition,
  edgeGeometry,
  influenceSummary,
  isAiProfile,
  isGate,
  isExcused,
  NODE_SIZE_LIMITS,
  isUnrated,
  isValue,
  navigate,
  NAV_KEYS,
  secondaryLinkPath,
} from '../domain/index.ts';
import type { Node, Position, Size } from '../domain/index.ts';
import {
  addNode,
  arrangeTree,
  attachLibraryReason,
  canAttachLibraryReason,
  canEdit,
  chooseActor,
  deleteNode,
  setSubtreeCollapsed,
  startInlineEdit,
  toggleFocus,
} from './actions.ts';
import { ADD_LOCAL_USER } from './actions.ts';
import { FIT_LEGIBLE, FIT_WHOLE, fitCamera, pinchCamera, revealRect, wheelAction, zoomAt } from './camera.ts';
import type { Camera, Point } from './camera.ts';
import { ClaimPreview, previewHandlers } from './ClaimPreview.tsx';
import { ContextMenu } from './ContextMenu.tsx';
import {
  cardChips,
  displayedPrimaryRelation,
  importanceHint,
  importanceText,
  relationLabel,
  reasonTypeLabel,
  shownInfluence,
  shownScore,
  signed,
  userTraces,
  viewedAssessorId,
} from './derive.ts';
import { asciiEdgeParts } from './AsciiEdge.tsx';
import { GroveAmbient, GroveCreatures, GroveCrown, GroveFoliage, GroveMist, GroveScenery } from './Grove.tsx';
import { groveCalm, pickCreatures } from './grove.ts';
import { dropRestoredGhosts } from './fade.ts';
import type { Frame } from './projection.ts';
import { displayShortcut } from './shortcuts.ts';
import type { Shortcuts } from './shortcuts.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { Orientation } from './view.ts';

/** The selection bar's height with its gap: the room it needs above a card, else it goes below. */
const SELECTION_BAR_ROOM = 46;
const ORIENTATION_ARROWS: Record<Orientation, string> = { horizontal: '→', vertical: '↓', 'four-way': '✣' };
const ORIENTATION_KEYS = {
  horizontal: 'leftRight',
  vertical: 'topDown',
  'four-way': 'fourDirections',
} as const;

/** The height of the canvas that can be seen: on a phone the inspector is a sheet over its lower part, and a card
 * brought into view under the sheet is not in view (the top-down tree puts a new reason exactly there). */
function freeHeight(viewport: HTMLElement): number {
  const sheet = document.querySelector<HTMLElement>('.inspector-panel');
  if (!sheet || getComputedStyle(sheet).position !== 'fixed') return viewport.clientHeight;
  const view = viewport.getBoundingClientRect();
  const top = sheet.getBoundingClientRect().top;
  if (top <= view.top || top >= view.bottom) return viewport.clientHeight;
  return Math.max(120, Math.round(top - view.top));
}

/** The title editor is as tall as its text, never shorter than the room the card gives it: a title that wraps to
 * a second line used to lose the lower half of its letters (owner's report 2026-11-19). */
function fitEditor(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = '';
  if (el.scrollHeight > el.clientHeight) el.style.height = `${el.scrollHeight + 4}px`;
}

function InlineEditor({ node, onFinish }: { node: Node; onFinish: (title: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const t = useTranslator();
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
    fitEditor(ref.current);
  }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    onFinish(save ? (ref.current?.value ?? '').trim() : null);
  };
  return (
    <textarea
      ref={ref}
      className="node-inline-editor"
      maxLength={200}
      aria-label={t('editSelected')}
      aria-multiline="true"
      defaultValue={node.title}
      onInput={(e) => fitEditor(e.currentTarget)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        }
      }}
      onBlur={() => queueMicrotask(() => finish(true))}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

export function Canvas({ frame, shortcuts }: { frame: Frame; shortcuts: Shortcuts }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view } = state;
  const l = view.layers;
  const H = frame.cardH;
  const editable = canEdit(state);
  const [camera, setCamera] = useState<Camera>({ x: 80, y: 80, scale: 0.82 });
  const cameraRef = useRef(camera);
  useLayoutEffect(() => {
    cameraRef.current = camera;
  }, [camera]);
  useLayoutEffect(dropRestoredGhosts, [project]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<{ id: string; pos: Position } | null>(null);
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [bareWanted, setBareWanted] = useState(false);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setBareWanted(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const nodes = frame.projection.nodes;
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  // A card being resized shows its live size (owner request 2026-11-10).
  const [liveSize, setLiveSize] = useState<{ id: string; size: Size } | null>(null);
  const sizeOf = (id: string): Size => (liveSize && liveSize.id === id ? liveSize.size : frame.sizeOf(id));
  // The reading view lays every orientation out as a tidy tree; four directions read left to right there.
  const edgeOrientation = frame.reading && view.orientation === 'four-way' ? 'horizontal' : view.orientation;
  const visualPosition = useCallback(
    (node: Node): Position => (live && live.id === node.id ? live.pos : frame.visualPosition(node)),
    [live, frame]
  );

  // ---- camera -------------------------------------------------------------------------------------------------
  // An automatic fit (a document opened, a card added, the tree arranged) keeps the cards readable and, when the
  // tree is then larger than the view, keeps the selected card in view: the main claim of an opened document, the
  // card just added. "Sovita näkymään" (the ⤢ button, the dock's button, the 0 key) shows the whole tree (camera.ts).
  const fitViewport = useCallback(
    (floor: number) => {
      const viewport = viewportRef.current;
      if (!viewport || !nodes.length) return;
      const vw = viewport.clientWidth;
      const vh = freeHeight(viewport);
      if (!vw || !vh) return;
      const selectedId = getStore().get().selectedId;
      const rects = nodes.map((n) => ({
        ...frame.visualPosition(n),
        ...frame.sizeOf(n.id),
        anchor: n.id === selectedId ? 2 : n.parentId ? 0 : 1,
      }));
      const minX = Math.min(...rects.map((p) => p.x));
      const minY = Math.min(...rects.map((p) => p.y));
      const bounds = {
        x: minX,
        y: minY,
        w: Math.max(...rects.map((p) => p.x + p.w)) - minX,
        h: Math.max(...rects.map((p) => p.y + p.h)) - minY,
      };
      const anchor = rects.reduce((best, r) => (r.anchor > best.anchor ? r : best));
      setCamera(fitCamera(bounds, { w: vw, h: vh }, floor, anchor));
    },
    [nodes, frame]
  );
  const centerNode = useCallback(
    (id: string) => {
      const viewport = viewportRef.current;
      const node = byId.get(id);
      if (!viewport || !node) return;
      const pos = frame.visualPosition(node);
      const size = frame.sizeOf(node.id);
      const { scale } = cameraRef.current;
      setCamera({
        scale,
        x: viewport.clientWidth / 2 - (pos.x + size.w / 2) * scale,
        y: freeHeight(viewport) / 2 - (pos.y + size.h / 2) * scale,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frame]
  );
  const zoomAround = useCallback((nextScale: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    setCamera(zoomAt(cameraRef.current, nextScale, clientX - rect.left, clientY - rect.top));
  }, []);
  const zoomCenter = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomAround(cameraRef.current.scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [zoomAround]
  );
  // The card being worked on is never off screen: a card whose title editor opens (just added, F2, a double click)
  // and a card selected from the outline, the table or the keyboard are brought wholly into view by the smallest
  // move. A card pressed on the canvas is under the pointer already and stays put, so a drag never starts with a jump.
  const pressedOnCanvas = useRef(false);
  const editingId = state.inlineEditId;
  const revealId = editingId ?? state.selectedId;
  useEffect(() => {
    if (pressedOnCanvas.current && !editingId) {
      pressedOnCanvas.current = false;
      return;
    }
    pressedOnCanvas.current = false;
    const raf = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const node = nodes.find((n) => n.id === revealId);
      if (!viewport || !node) return;
      const rect = { ...frame.visualPosition(node), ...frame.sizeOf(node.id) };
      setCamera((c) => revealRect(c, rect, { w: viewport.clientWidth, h: freeHeight(viewport) }));
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealId, editingId, nodes.length]);
  const fitRequest = state.fitRequest;
  useEffect(() => {
    const raf = requestAnimationFrame(() => fitViewport(FIT_LEGIBLE));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);
  const centerRequest = state.centerRequest;
  useEffect(() => {
    if (!centerRequest) return;
    const raf = requestAnimationFrame(() => centerNode(centerRequest.id));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerRequest]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const action = wheelAction(e);
      if (action.kind === 'zoom') zoomAround(cameraRef.current.scale * action.factor, e.clientX, e.clientY);
      else setCamera((c) => ({ ...c, x: c.x + action.dx, y: c.y + action.dy }));
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [zoomAround]);
  // Camera keys live on the document in the prototype; App forwards them here through custom events.
  useEffect(() => {
    const onCamera = (e: Event) => {
      const detail = (
        e as CustomEvent<{ kind: 'zoom' | 'fit' | 'pan'; factor?: number; dx?: number; dy?: number }>
      ).detail;
      if (detail.kind === 'fit') fitViewport(FIT_WHOLE);
      else if (detail.kind === 'zoom') zoomCenter(detail.factor ?? 1);
      else setCamera((c) => ({ ...c, x: c.x + (detail.dx ?? 0), y: c.y + (detail.dy ?? 0) }));
    };
    window.addEventListener('witt-camera', onCamera);
    return () => window.removeEventListener('witt-camera', onCamera);
  }, [fitViewport, zoomCenter]);

  // ---- pan ----------------------------------------------------------------------------------------------------
  const pan = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  // Two fingers anywhere on the canvas, cards included, move and scale the view; a card drag under way is dropped.
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ ids: [number, number]; from: [Point, Point]; camera: Camera } | null>(null);
  const viewportPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onTouchDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    touches.current.set(e.pointerId, viewportPoint(e));
    if (touches.current.size !== 2) return;
    const [a, b] = [...touches.current.entries()] as [[number, Point], [number, Point]];
    pinch.current = { ids: [a[0], b[0]], from: [a[1], b[1]], camera: cameraRef.current };
    pan.current = null;
    setLive(null);
    e.stopPropagation();
  };
  const onTouchMoveCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, viewportPoint(e));
    const p = pinch.current;
    if (!p) return;
    const [a, b] = [touches.current.get(p.ids[0]), touches.current.get(p.ids[1])];
    if (a && b) setCamera(pinchCamera(p.camera, p.from, [a, b]));
    e.stopPropagation();
  };
  const onTouchEndCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    touches.current.delete(e.pointerId);
    if (pinch.current?.ids.includes(e.pointerId)) pinch.current = null;
  };
  const onViewportPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.node')) return;
    pan.current = { startX: e.clientX, startY: e.clientY, originX: camera.x, originY: camera.y };
    e.currentTarget.classList.add('panning');
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onViewportPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (!p || pinch.current) return;
    setCamera((c) => ({
      ...c,
      x: p.originX + (e.clientX - p.startX),
      y: p.originY + (e.clientY - p.startY),
    }));
  };
  const onViewportPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pan.current = null;
    e.currentTarget.classList.remove('panning');
  };

  // ---- node drag ------------------------------------------------------------------------------------------------
  /** Owner request 2026-11-10: drag a card's corner to give it its own size; a double click restores the default. */
  const beginResize = (e: ReactPointerEvent<HTMLElement>, node: Node) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY, ...frame.sizeOf(node.id) };
    const L = NODE_SIZE_LIMITS;
    let size: Size | null = null;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const scale = cameraRef.current.scale;
      size = {
        w: Math.round(clamp(start.w + (ev.clientX - start.x) / scale, L.minW, L.maxW)),
        h: Math.round(clamp(start.h + (ev.clientY - start.y) / scale, L.minH, L.maxH)),
      };
      setLiveSize({ id: node.id, size });
    };
    const finish = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      setLiveSize(null);
      if (size) store.dispatch({ type: 'node.resize', id: node.id, size });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  };
  const beginNodeDrag = (e: ReactPointerEvent<HTMLElement>, node: Node, fromTitle: boolean) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    if (!fromTitle) e.preventDefault();
    e.stopPropagation();
    if (state.selectedId !== node.id || state.selectedLibraryReason) {
      pressedOnCanvas.current = true;
      store.select(node.id);
    }
    if (!editable || frame.reading) return;
    if ((view.depthLimit !== null && view.depthCompact) || view.compactVisible) {
      store.showMessage(t('compactDragHint'));
      return;
    }
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startY = e.clientY;
    const original = frame.visualPosition(node);
    const originalOffset = { ...(project.layout.fourWayOffsets[node.id] ?? { x: 0, y: 0 }) };
    let changed = false;
    let last = original;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (pinch.current) {
        changed = false;
        return;
      }
      const dx = (ev.clientX - startX) / cameraRef.current.scale;
      const dy = (ev.clientY - startY) / cameraRef.current.scale;
      if (!changed && Math.abs(dx) + Math.abs(dy) < 4) return;
      changed = true;
      last = { x: original.x + dx, y: original.y + dy };
      setLive({ id: node.id, pos: last });
    };
    const finish = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      setLive(null);
      if (!changed) return;
      if (view.orientation === 'four-way') {
        store.dispatch({
          type: 'layout.fourWay',
          offsets: {
            ...project.layout.fourWayOffsets,
            [node.id]: {
              x: originalOffset.x + (last.x - original.x),
              y: originalOffset.y + (last.y - original.y),
            },
          },
        });
      } else {
        const doc = documentPosition(last, view.orientation);
        store.dispatch({
          type: 'node.position',
          positions: { [node.id]: { x: clamp(doc.x, -100000, 100000), y: clamp(doc.y, -100000, 100000) } },
        });
      }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  };

  // ---- keyboard on a card ---------------------------------------------------------------------------------------
  const onCardKeyDown = (e: ReactKeyboardEvent<HTMLElement>, node: Node) => {
    if (e.target !== e.currentTarget) return;
    if ((e.key === 'F2' || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      startInlineEdit(node.id);
      return;
    }
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      store.select(node.id);
      setMenu({ nodeId: node.id, x: rect.left + Math.min(60, rect.width), y: rect.top + 35 });
      return;
    }
    if (NAV_KEYS.includes(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const navNodes =
        view.depthLimit === null
          ? project.nodes
          : project.nodes.map((n) => ({ ...n, collapsed: frame.isNodeCollapsed(n) }));
      const result = navigate(
        navNodes,
        frame.rootId,
        frame.projection.visibleIds,
        node.id,
        e.key,
        view.orientation,
        frame.positions
      );
      if (result.action === 'select') {
        store.select(result.id);
        requestAnimationFrame(() => focusCard(result.id));
      } else if (result.action === 'expand' || result.action === 'collapse') {
        setSubtreeCollapsed(result.id, result.action === 'collapse');
        requestAnimationFrame(() => focusCard(result.id));
      }
    }
  };
  const focusCard = (id: string) =>
    viewportRef.current
      ?.querySelector<HTMLElement>(`.node[data-id="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true });

  // ---- edges ----------------------------------------------------------------------------------------------------
  const points = nodes.map((n) => ({ ...visualPosition(n), ...sizeOf(n.id) }));
  const minX = points.length ? Math.min(...points.map((p) => p.x)) - 180 : 0;
  const minY = points.length ? Math.min(...points.map((p) => p.y)) - 180 : 0;
  const maxX = points.length ? Math.max(...points.map((p) => p.x + p.w)) + 180 : 8000;
  const maxY = points.length ? Math.max(...points.map((p) => p.y + p.h)) + 180 : 8000;
  const positionsForEdges = new Map(nodes.map((n) => [n.id, visualPosition(n)]));
  const ids = frame.projection.visibleIds;
  const focusing = view.focus.mode !== 'all';
  // Owner request 2026-11-10: an edge's width and a reason's opacity follow the weight it actually carries
  // (|influence| × strength under the document's method, 0…5 → 0…1), so many weak reasons do not look decisive.
  const carried = (child: Node): number | null => {
    if (!view.weightByRatings || !child.parentId) return null;
    const contribution = shownScore(frame, child.parentId)?.contributions.find(
      (c) => c.id === child.id && c.subjectType === 'primary'
    );
    return contribution && !contribution.missing && contribution.magnitude !== null
      ? clamp(contribution.magnitude / 5, 0, 1)
      : null;
  };
  const groveEdges = new Map<string, string>();
  const edges = nodes.flatMap((child) => {
    if (!child.parentId || !ids.has(child.parentId)) return [];
    const parent = byId.get(child.parentId);
    if (!parent) return [];
    const classes = ['edge', `edge-${displayedPrimaryRelation(frame, child)}`];
    let title: string | undefined;
    if (view.indexMode === 'personal' && child.relation !== 'option' && child.relation !== 'group') {
      const direction = shownInfluence(frame, child);
      if (direction === null) {
        classes.push('edge-unassessed');
        title = t('personalNotAssessed');
      } else {
        classes.push(
          direction > 0
            ? 'edge-personal-support'
            : direction < 0
              ? 'edge-personal-oppose'
              : 'edge-personal-neutral'
        );
        title = `${t('personalInfluenceTitle')}: ${signed(direction)}/5`;
      }
    } else if (view.workflow === 'evaluate' && child.relation !== 'option' && child.relation !== 'group') {
      const stats = frame.lens.filtered
        ? frame.lens.impact.get(child.id)
        : influenceSummary(project, 'primary', child.id);
      if (
        stats &&
        (stats.status === 'contradictory' || stats.status === 'neutral' || stats.status === 'mixed-neutral')
      ) {
        classes.push(`edge-review-${stats.status}`);
        const label =
          stats.status === 'contradictory'
            ? t('influenceStatusContradictory')
            : stats.status === 'neutral'
              ? t('influenceStatusNeutral')
              : t('influenceStatusMixedNeutral');
        title = `${t('influenceDistribution', { positive: stats.positive, negative: stats.negative, neutral: stats.neutral })}. ${label}`;
      }
    }
    const effect = frame.importance.effects.get(child.id);
    if (frame.importance.importantIds.has(child.id) && effect) {
      classes.push('edge-important');
      title = `${title ? `${title} · ` : ''}${importanceHint(project, t, effect)}`;
    }
    if (focusing)
      classes.push(
        frame.projection.matchIds.has(child.id)
          ? 'focus-match'
          : frame.projection.contextIds.has(child.id)
            ? 'focus-context'
            : 'focus-muted'
      );
    const d = edgeGeometry(parent, child, edgeOrientation, CARD_W, H, positionsForEdges, frame.directions, {
      from: sizeOf(parent.id),
      to: sizeOf(child.id),
    });
    groveEdges.set(child.id, d);
    const importanceDelta =
      effect && frame.importance.importantIds.has(child.id) ? String(effect.delta) : undefined;
    if (state.appearance === 'ascii')
      return [
        <g
          key={child.id}
          className={`${classes.join(' ')} ascii-edge`}
          data-focus-stance={focusing ? view.focus.mode : undefined}
          data-importance-delta={importanceDelta}
        >
          {title ? <title>{title}</title> : null}
          {asciiEdgeParts(d)}
        </g>,
      ];
    const weight = carried(child);
    return [
      <path
        key={child.id}
        className={classes.join(' ')}
        data-focus-stance={focusing ? view.focus.mode : undefined}
        data-importance-delta={importanceDelta}
        data-child={child.id}
        data-weight={weight === null ? undefined : weight.toFixed(2)}
        style={
          weight === null ? undefined : { strokeWidth: 1.5 + 4 * weight, strokeOpacity: 0.3 + 0.7 * weight }
        }
        d={d}
      >
        {title ? <title>{title}</title> : null}
      </path>,
    ];
  });
  const linkEdges = l.links
    ? (project.links ?? []).flatMap((link) => {
        const source = byId.get(link.sourceId);
        const target = byId.get(link.targetId);
        if (!source || !target || !ids.has(source.id) || !ids.has(target.id)) return [];
        const selectedLink = state.selectedId === source.id || state.selectedId === target.id;
        return [
          <path
            key={link.id}
            className={`edge edge-secondary edge-${link.relation}${focusing ? ' focus-muted' : ''}${selectedLink ? ' link-selected' : ''}`}
            markerEnd={`url(#secondary-${link.relation}-arrow)`}
            data-link-id={link.id}
            d={secondaryLinkPath(visualPosition(source), visualPosition(target), CARD_W, H, {
              from: sizeOf(source.id),
              to: sizeOf(target.id),
            })}
          >
            <title>{`${source.title} → ${target.title} (${t(link.relation === 'support' ? 'supportWord' : 'opposeWord')}, ${link.impact}/5)`}</title>
          </path>,
        ];
      })
    : [];

  // ---- cards ----------------------------------------------------------------------------------------------------
  const depthOf = (id: string): number => {
    let depth = 0;
    for (let node = byId.get(id); node?.parentId; node = byId.get(node.parentId)) depth++;
    return depth;
  };
  // Owner request 2026-11-10: one person's created, edited and commented nodes stand out; the rest fade.
  const highlightUser =
    view.highlightUserId && project.users.some((u) => u.id === view.highlightUserId)
      ? view.highlightUserId
      : null;
  const traces = highlightUser ? userTraces(project, highlightUser) : null;
  /** Below an unrated note nothing scores upward, so its branch is shown dimmed (owner 2026-11-10). */
  const underUnrated = (node: Node): boolean => {
    for (
      let up = node.parentId ? byId.get(node.parentId) : undefined;
      up;
      up = up.parentId ? byId.get(up.parentId) : undefined
    )
      if (isUnrated(up)) return true;
    return false;
  };
  const renderCard = (node: Node) => {
    const pos = visualPosition(node);
    const relation = displayedPrimaryRelation(frame, node);
    const effect = frame.importance.effects.get(node.id);
    const important = frame.importance.importantIds.has(node.id);
    const childCount = project.nodes.filter((n) => n.parentId === node.id).length;
    const collapsed = frame.isNodeCollapsed(node);
    const selected = node.id === state.selectedId;
    const classes = ['node'];
    if (node.parentId === null) classes.push('is-root');
    if (important) classes.push('important-reason');
    if (frame.leadingOptionIds?.has(node.id)) classes.push('ai-leading-option');
    const trace = traces?.get(node.id);
    if (traces) {
      if (trace?.created) classes.push('user-created');
      if (trace?.edited) classes.push('user-edited');
      if (trace?.commented) classes.push('user-commented');
      if (!trace) classes.push('user-other');
    }
    const carriedWeight = carried(node);
    if (carriedWeight !== null && carriedWeight < 0.15) classes.push('weak-reason');
    if (frame.mutedIds.has(node.id)) classes.push('muted-node');
    if (isUnrated(node)) classes.push('unrated-node');
    else if (
      frame.mutedBranchIds.has(node.id) ||
      underUnrated(node) ||
      (view.indexMode === 'personal' &&
        isExcused(project, node.id, viewedAssessorId(project, view, state.actorId)))
    )
      classes.push('under-unrated');
    if (
      view.indexMode === 'personal' &&
      node.parentId &&
      node.relation !== 'option' &&
      node.relation !== 'group' &&
      !isUnrated(node)
    ) {
      const direction = shownInfluence(frame, node);
      classes.push(
        direction === null
          ? 'unassessed-reason'
          : direction > 0
            ? 'personal-support'
            : direction < 0
              ? 'personal-oppose'
              : 'personal-neutral'
      );
    }
    if (node.sharedReasonId) classes.push('shared-use-node');
    if (node.reasonConceptId) classes.push('context-use-node');
    if (node.kind === 'group') classes.push('option-group-node');
    if (isGate(node)) classes.push('semantic-gate');
    if (isValue(node)) classes.push('semantic-value');
    if (selected) classes.push('selected');
    if (H === 94 && !frame.reading) classes.push('text-only');
    // Owner request 2026-11-10: the reading view's whole text, or a card's own dragged size.
    const ownSize =
      frame.reading || project.layout.nodeSizes?.[node.id] || liveSize?.id === node.id
        ? sizeOf(node.id)
        : null;
    const titleLines = frame.titleLinesOf(node.id);
    if (frame.reading) classes.push('reading-card');
    else if (ownSize) classes.push('sized-card');
    if (focusing) {
      classes.push(
        frame.projection.matchIds.has(node.id)
          ? 'focus-match'
          : node.id === frame.projection.anchorId
            ? 'focus-anchor'
            : frame.projection.contextIds.has(node.id)
              ? 'focus-context'
              : 'focus-muted'
      );
      if (frame.projection.peekIds.has(node.id)) classes.push('focus-peek');
    }
    if (dropTarget === node.id) classes.push('repeat-drop-target');
    const label = relationLabel(frame, t, node);
    const ariaLabel = `${label}: ${node.title}${isGate(node) ? ` · ${t('semanticGate')}` : ''}${important && effect ? ` · ${importanceText(t, effect)}` : ''}`;
    const creator = project.users.find((u) => u.id === node.createdBy);
    const showAuthor =
      creator &&
      (isAiProfile(creator) ||
        (project.settings.showAuthors !== false && node.authorVisibility === 'named')) &&
      l.labels;
    const addDisabled = !editable || !!node.sharedReasonId || node.kind === 'group';
    const chips = cardChips(frame, t, node, l, frame.importance);
    const preview = previewHandlers(node.id, '.node-title', store.setClaimPreview);
    const dragging = state.draggingLibraryReason;
    return (
      <article
        key={node.id}
        className={classes.join(' ')}
        data-id={node.id}
        data-relation={relation}
        data-focus-stance={focusing ? view.focus.mode : undefined}
        data-importance-delta={effect && view.showImportance ? String(effect.delta) : undefined}
        data-editing={state.inlineEditId === node.id ? 'true' : undefined}
        data-testid={`node-${node.id}`}
        style={{
          left: pos.x,
          top: pos.y,
          ...(ownSize ? { width: ownSize.w, height: ownSize.h } : {}),
          ...(titleLines ? { ['--title-lines' as string]: titleLines } : {}),
        }}
        tabIndex={selected ? 0 : -1}
        role="treeitem"
        aria-selected={selected}
        aria-level={depthOf(node.id) + 1}
        aria-expanded={childCount ? !collapsed : undefined}
        aria-label={ariaLabel}
        title={
          effect && view.showImportance ? `${node.title} · ${importanceHint(project, t, effect)}` : node.title
        }
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button,textarea')) return;
          if (state.selectedId !== node.id || state.selectedLibraryReason) store.select(node.id);
        }}
        onDoubleClick={(e) => {
          if (!node.sharedReasonId && !node.reasonConceptId && !(e.target as HTMLElement).closest('button'))
            startInlineEdit(node.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          store.select(node.id);
          setMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => onCardKeyDown(e, node)}
        onDragOver={(e) => {
          if (!dragging || !canAttachLibraryReason(project, dragging, node.id, editable)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (dropTarget !== node.id) setDropTarget(node.id);
        }}
        onDragLeave={() => dropTarget === node.id && setDropTarget(null)}
        onDrop={(e) => {
          setDropTarget(null);
          if (!dragging) return;
          e.preventDefault();
          e.stopPropagation();
          attachLibraryReason(dragging, node.id);
          store.setDraggingLibraryReason(null);
        }}
        {...preview}
      >
        <div className="node-header" onPointerDown={(e) => beginNodeDrag(e, node, false)}>
          <span className={`node-tag${l.labels ? '' : ' compact-tag'}`} title={label}>
            {label}
          </span>
          {showAuthor && creator ? (
            isAiProfile(creator) ? (
              <small className="node-ai-author" title={`${t('aiAuthored')}: ${creator.name}`}>
                AI
              </small>
            ) : (
              <small className="node-author" title={`${t('authoredBy')}: ${creator.name}`}>
                ✎
              </small>
            )
          ) : (
            <span className="node-grip">⠿</span>
          )}
          <button
            type="button"
            className="node-add support"
            data-relation="support"
            title={`${t('supportAdd')} (${displayShortcut(shortcuts.support)})`}
            aria-label={`${t('supportAdd')}: ${node.title}`}
            disabled={addDisabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addNode('support', node.id);
            }}
          >
            +
          </button>
          <button
            type="button"
            className="node-add oppose"
            data-relation="oppose"
            title={`${t('opposeAdd')} (${displayShortcut(shortcuts.oppose)})`}
            aria-label={`${t('opposeAdd')}: ${node.title}`}
            disabled={addDisabled}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addNode('oppose', node.id);
            }}
          >
            −
          </button>
          {project.mode === 'decision' && (node.parentId === null || node.kind === 'group') ? (
            <>
              <button
                type="button"
                className="node-add option"
                title={t('optionAdd')}
                aria-label={`${t('optionAdd')}: ${node.title}`}
                disabled={!editable || project.votingRound?.status === 'open'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addNode('option', node.id);
                }}
              >
                *
              </button>
              <button
                type="button"
                className="node-add group"
                title={t('optionGroupAdd')}
                aria-label={`${t('optionGroupAdd')}: ${node.title}`}
                disabled={!editable || project.votingRound?.status === 'open'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  addNode('group', node.id);
                }}
              >
                ▦
              </button>
            </>
          ) : null}
          {frame.mutedIds.has(node.id) ? (
            <button
              type="button"
              className="node-mute"
              data-testid="node-muted"
              title={t('muteOff')}
              aria-label={`${t('muteOff')}: ${node.title}`}
              onClick={(e) => {
                e.stopPropagation();
                store.toggleMuted(node.id);
              }}
            >
              {t('mutedMark')}
            </button>
          ) : null}
          <button
            type="button"
            className="node-collapse"
            title={collapsed ? t(focusing ? 'branchPeek' : 'branchOpen') : t('branchClose')}
            disabled={childCount === 0}
            onClick={(e) => {
              e.stopPropagation();
              setSubtreeCollapsed(node.id);
            }}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          {node.parentId !== null ? (
            <button
              type="button"
              className="node-delete"
              title={`${t(childCount ? 'deleteSubtree' : 'deleteNode')} (Del)`}
              aria-label={`${t(childCount ? 'deleteSubtree' : 'deleteNode')}: ${node.title}`}
              disabled={!editable}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void deleteNode(node.id);
              }}
            >
              ×
            </button>
          ) : null}
        </div>
        {node.sharedReasonId ||
        node.reasonConceptId ||
        isUnrated(node) ||
        !!trace ||
        (node.semanticType &&
          node.semanticType !== 'unspecified' &&
          !node.sharedReasonId &&
          !reasonTypeLabel(node)) ? (
          <div className="node-marks">
            {node.sharedReasonId ? <small className="shared-node-mark">{t('sharedBadge')}</small> : null}
            {node.reasonConceptId ? <small className="shared-node-mark">{t('contextBadge')}</small> : null}
            {isUnrated(node) ? <small className="node-unrated-mark">{t('unratedMark')}</small> : null}
            {trace ? (
              <small className="node-trace-mark" data-testid="trace-mark">
                {[
                  trace.created ? t('traceCreated') : null,
                  trace.edited ? t('traceEdited') : null,
                  trace.commented ? t('traceCommented') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            ) : null}
            {node.semanticType &&
            node.semanticType !== 'unspecified' &&
            !node.sharedReasonId &&
            !reasonTypeLabel(node) ? (
              <small className="node-semantic">{t(`semantic_${node.semanticType}`)}</small>
            ) : null}
          </div>
        ) : null}
        <div className="node-title" onPointerDown={(e) => beginNodeDrag(e, node, true)}>
          {node.title}
        </div>
        {l.details && node.details ? <div className="node-details">{node.details}</div> : null}
        {chips.length ? (
          <div className="node-meta">
            {chips.map((chip, i) => (
              <span key={i} className={`meta-chip ${chip.cls ?? ''}`} title={chip.title}>
                <span className="meta-value">{chip.value}</span>
                <span className="meta-name">{chip.label}</span>
              </span>
            ))}
          </div>
        ) : null}
        {state.inlineEditId === node.id ? (
          <InlineEditor
            node={node}
            onFinish={(title) => {
              store.setInlineEdit(null);
              if (title && title !== node.title) store.dispatch({ type: 'node.edit', id: node.id, title });
              // Back to the card, unless another card's editor opened meanwhile (a reason added straight after):
              // taking the focus then would close that editor.
              requestAnimationFrame(() => {
                if (!store.get().inlineEditId) focusCard(node.id);
              });
            }}
          />
        ) : null}
        {selected && editable && !frame.reading && view.presentation === 'tree' ? (
          <span
            className="node-resize"
            data-testid="node-resize"
            title={t('resizeCard')}
            aria-hidden="true"
            onPointerDown={(e) => beginResize(e, node)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (project.layout.nodeSizes?.[node.id])
                store.dispatch({ type: 'node.resize', id: node.id, size: null });
            }}
          />
        ) : null}
      </article>
    );
  };

  // The selected card's actions at a fixed size (owner 2026-11-19, S-15): the buttons inside a card shrink with the
  // zoom (24 px at 100 %), so below that, and on a touch screen at any zoom, the same actions follow the card here.
  const renderSelectionBar = () => {
    const node = nodes.find((n) => n.id === state.selectedId);
    if (!node || live || state.inlineEditId === node.id || state.selectedLibraryReason) return null;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (camera.scale >= 1 && !coarse) return null;
    const pos = visualPosition(node);
    const size = sizeOf(node.id);
    const top = camera.y + pos.y * camera.scale;
    const bottom = camera.y + (pos.y + size.h) * camera.scale;
    const right = camera.x + (pos.x + size.w) * camera.scale;
    const above = top >= SELECTION_BAR_ROOM;
    const childCount = project.nodes.filter((n) => n.parentId === node.id).length;
    const collapsed = frame.isNodeCollapsed(node);
    const addDisabled = !editable || !!node.sharedReasonId || node.kind === 'group';
    const optionParent = project.mode === 'decision' && (node.parentId === null || node.kind === 'group');
    const roundOpen = project.votingRound?.status === 'open';
    return (
      <div
        id="selectionBar"
        className={`selection-bar${above ? '' : ' below'}`}
        role="toolbar"
        aria-label={`${t('toolbarEditGroup')}: ${node.title}`}
        data-testid="selection-bar"
        style={{
          left: `clamp(${SELECTION_BAR_ROOM * 5}px, ${Math.round(right)}px, 100% - 4px)`,
          top: `${Math.round(above ? top - 6 : bottom + 6)}px`,
        }}
      >
        <button
          type="button"
          className="support"
          data-action="support"
          title={`${t('supportAdd')} (${displayShortcut(shortcuts.support)})`}
          aria-label={t('supportAdd')}
          disabled={addDisabled}
          onClick={() => addNode('support', node.id)}
        >
          +
        </button>
        <button
          type="button"
          className="oppose"
          data-action="oppose"
          title={`${t('opposeAdd')} (${displayShortcut(shortcuts.oppose)})`}
          aria-label={t('opposeAdd')}
          disabled={addDisabled}
          onClick={() => addNode('oppose', node.id)}
        >
          −
        </button>
        {optionParent ? (
          <>
            <button
              type="button"
              className="option"
              data-action="option"
              title={t('optionAdd')}
              aria-label={t('optionAdd')}
              disabled={!editable || roundOpen}
              onClick={() => addNode('option', node.id)}
            >
              *
            </button>
            <button
              type="button"
              className="option"
              data-action="group"
              title={t('optionGroupAdd')}
              aria-label={t('optionGroupAdd')}
              disabled={!editable || roundOpen}
              onClick={() => addNode('group', node.id)}
            >
              ▦
            </button>
          </>
        ) : null}
        <button
          type="button"
          data-action="edit"
          title={`${t('editSelected')} (F2)`}
          aria-label={t('editSelected')}
          disabled={!editable || !!node.sharedReasonId || !!node.reasonConceptId}
          onClick={() => startInlineEdit(node.id)}
        >
          {'✎\uFE0E'}
        </button>
        <button
          type="button"
          data-action="collapse"
          title={collapsed ? t('branchOpen') : t('branchClose')}
          aria-label={collapsed ? t('branchOpen') : t('branchClose')}
          disabled={childCount === 0}
          onClick={() => setSubtreeCollapsed(node.id)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        {node.parentId !== null ? (
          <button
            type="button"
            className="danger"
            data-action="delete"
            title={`${t(childCount ? 'deleteSubtree' : 'deleteNode')} (Del)`}
            aria-label={t(childCount ? 'deleteSubtree' : 'deleteNode')}
            disabled={!editable}
            onClick={() => void deleteNode(node.id)}
          >
            ×
          </button>
        ) : null}
      </div>
    );
  };

  // Tree only, with nothing else on screen: the bar, the zoom control and the legend go, and the browser is asked
  // for its full screen (it may refuse; the view is the same either way). Leaving the browser's full screen (Esc)
  // brings the buttons back.
  const bare = bareWanted && state.focusOnly;
  // Leaving the tree-only view by any way (F, Esc, the menu) ends the bare state with it.
  if (bareWanted && !state.focusOnly) setBareWanted(false);
  const setBareMode = (on: boolean) => {
    setBareWanted(on);
    if (on) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  };
  const grove = state.appearance === 'grove';
  const rootCard = grove ? nodes.find((n) => !n.parentId) : undefined;
  const rootAt = rootCard ? visualPosition(rootCard) : null;
  const orientationName = t(ORIENTATION_KEYS[view.orientation]);
  const toggleOrientation = () => {
    const order: Orientation[] = ['horizontal', 'vertical', 'four-way'];
    store.setView({ orientation: order[(order.indexOf(view.orientation) + 1) % order.length] });
    store.requestFit();
  };
  return (
    <section
      className={`canvas-area${grove && groveCalm(nodes.length) ? ' grove-calm' : ''}${bare ? ' canvas-bare' : ''}`}
      aria-label={t('tree')}
      data-testid="canvas"
    >
      {grove ? <GroveScenery /> : null}
      {grove ? <GroveAmbient /> : null}
      <div className="canvas-quick-controls" aria-label={t('viewSettingsButton')}>
        <button
          type="button"
          className="btn quiet"
          id="btnOrientationQuick"
          aria-pressed={view.orientation !== 'horizontal'}
          title={`${t('changeOrientation')}: ${orientationName}`}
          onClick={toggleOrientation}
        >
          {ORIENTATION_ARROWS[view.orientation]} {orientationName}
        </button>
        <button
          type="button"
          className="btn quiet"
          id="btnArrangeQuick"
          title={t('arrange')}
          onClick={arrangeTree}
        >
          {t('arrange')}
        </button>
        <button
          type="button"
          className="btn quiet"
          id="btnUndoQuick"
          disabled={!state.canUndo}
          onClick={() => store.undo()}
        >
          {t('undo')}
        </button>
        <label className="visually-hidden" htmlFor="actorQuickSelect">
          {t('profileSelect')}
        </label>
        <select
          id="actorQuickSelect"
          className="quick-profile-select"
          title={t('profileSelect')}
          value={state.actorId}
          onChange={(e) => void chooseActor(e.target.value)}
        >
          {project.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {isAiProfile(u) ? ' · AI' : ''}
            </option>
          ))}
          <option value={ADD_LOCAL_USER}>{t('profileAddLocalOption')}</option>
        </select>
        <button
          type="button"
          className="btn quiet"
          id="btnAssessQuick"
          disabled={!editable}
          onClick={() => store.openDialog('assessment')}
        >
          ◉ {t('assessmentStart')}
        </button>
        <button
          type="button"
          className="btn quiet"
          id="btnEditQuick"
          title={t('editSelected')}
          onClick={() => startInlineEdit(state.selectedId)}
        >
          ✎ {t('editSelected')}
        </button>
        <button
          type="button"
          className="btn quiet"
          id="btnReviewLensQuick"
          aria-pressed={frame.lens.filtered}
          onClick={() => store.openDialog('reviewLens')}
        >
          {t('reviewLens')}
          {frame.lens.filtered ? ` · ${frame.lens.selectedCount}/${frame.lens.totalCount}` : ''}
        </button>
        <button
          type="button"
          className="btn quiet"
          id="btnKeyboardQuick"
          title={t('shortcutsButton')}
          onClick={() => store.openDialog('help')}
        >
          ⌨ {t('shortcutsButton')}
        </button>
        {/* Leaving is at the right end, under the Näkymä menu the view was entered from, and names its key as the
            menu does (owner 2026-11-19, S-15); the prototype has it first on the left. */}
        <button
          type="button"
          className="btn quiet quick-bare"
          id="btnFocusBare"
          title={t('focusBare')}
          onClick={() => setBareMode(true)}
        >
          ⤢ {t('focusBare')}
        </button>
        <button
          type="button"
          className="btn quiet quick-exit"
          id="btnFocusQuick"
          aria-pressed={state.focusOnly}
          title={`${t(state.focusOnly ? 'exitFocus' : 'focusTree')} (${shortcuts.focus}, Esc)`}
          onClick={() => toggleFocus()}
        >
          ⛶ {t(state.focusOnly ? 'exitFocus' : 'focusTree')} <kbd>{shortcuts.focus}</kbd>
        </button>
      </div>
      {bare ? (
        // Nothing but the tree (owner 2026-11-19): two small marks in the corner bring the buttons back or leave.
        <div className="canvas-bare-controls" data-testid="bare-controls">
          <button
            type="button"
            id="btnFocusBareShow"
            title={t('focusBareShow')}
            aria-label={t('focusBareShow')}
            onClick={() => setBareMode(false)}
          >
            ⋯
          </button>
          <button
            type="button"
            id="btnFocusBareExit"
            title={`${t('exitFocus')} (${shortcuts.focus}, Esc)`}
            aria-label={t('exitFocus')}
            onClick={() => {
              setBareMode(false);
              toggleFocus(false);
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      <div
        id="viewport"
        ref={viewportRef}
        tabIndex={0}
        aria-label={t('canvasKeyboardHelp')}
        data-testid="viewport"
        onPointerDownCapture={onTouchDownCapture}
        onPointerMoveCapture={onTouchMoveCapture}
        onPointerUpCapture={onTouchEndCapture}
        onPointerCancelCapture={onTouchEndCapture}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu({ nodeId: state.selectedId, x: rect.left + 60, y: rect.top + 35 });
          }
        }}
      >
        <div
          id="world"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}
        >
          <svg
            id="edges"
            aria-hidden="true"
            style={{ left: minX, top: minY }}
            width={maxX - minX}
            height={maxY - minY}
            viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
          >
            <defs>
              <filter id="wittSketch" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.03"
                  numOctaves="2"
                  seed="7"
                  result="noise"
                />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" />
              </filter>
              <marker
                id="secondary-support-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <path d="M0 0 L7 3 L0 6 Z" className="secondary-arrow-support" />
              </marker>
              <marker
                id="secondary-oppose-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <path d="M0 0 L7 3 L0 6 Z" className="secondary-arrow-oppose" />
              </marker>
            </defs>
            {grove && !groveCalm(nodes.length) ? (
              <GroveFoliage
                cards={nodes.map((n) => ({
                  id: n.id,
                  ...visualPosition(n),
                  ...sizeOf(n.id),
                  depth: depthOf(n.id),
                }))}
              />
            ) : null}
            {grove && !groveCalm(nodes.length) ? (
              <GroveMist cards={nodes.map((n) => ({ ...visualPosition(n), ...sizeOf(n.id) }))} />
            ) : null}
            {rootAt && rootCard ? (
              <GroveCrown
                x={rootAt.x + sizeOf(rootCard.id).w / 2}
                y={rootAt.y + sizeOf(rootCard.id).h / 2}
                spread={(maxX - minX) / 2}
              />
            ) : null}
            <g id="edgePaths">
              {edges}
              {linkEdges}
            </g>
            {grove ? (
              <GroveCreatures creatures={pickCreatures([...groveEdges.keys()])} edges={groveEdges} />
            ) : null}
          </svg>
          <div
            id="nodesLayer"
            role="tree"
            aria-label={t('tree')}
            style={{ ['--card-height' as string]: `${H}px` }}
          >
            {nodes.map(renderCard)}
          </div>
          <div id="nodeGhosts" aria-hidden="true" style={{ ['--card-height' as string]: `${H}px` }} />
        </div>
      </div>
      <div id="keyboardStatus" aria-live="polite" className="visually-hidden" />
      {renderSelectionBar()}
      <div className="zoom-controls">
        <button type="button" id="zoomOut" title={t('zoomOut')} onClick={() => zoomCenter(1 / 1.2)}>
          −
        </button>
        <span id="zoomLabel" data-testid="zoom-label">
          {Math.round(camera.scale * 100)} %
        </span>
        <button type="button" id="zoomIn" title={t('zoomIn')} onClick={() => zoomCenter(1.2)}>
          +
        </button>
        <button
          type="button"
          id="zoomReset"
          title={t('fit')}
          data-testid="fit"
          onClick={() => fitViewport(FIT_WHOLE)}
        >
          ⤢
        </button>
      </div>
      <div className="legend">
        <span>
          <i className="support-mark" />
          <span>{t('supportWord')}</span>
        </span>
        <span>
          <i className="oppose-mark" />
          <span>{t('opposeWord')}</span>
        </span>
        <span>
          <i className="option-mark" />
          <span>{t('optionType')}</span>
        </span>
        {l.index && view.workflow === 'evaluate' ? (
          <span id="incompleteLegend">{t('incompleteLegend')}</span>
        ) : null}
        {l.links ? (
          <span id="linkLegend">
            <i className="secondary-mark" />
            <span>{t('secondaryLinks')}</span>
          </span>
        ) : null}
      </div>
      <ClaimPreview frame={frame} />
      {menu ? (
        <ContextMenu
          frame={frame}
          nodeId={menu.nodeId}
          x={menu.x}
          y={menu.y}
          shortcuts={shortcuts}
          onClose={(restoreFocus) => {
            setMenu(null);
            if (restoreFocus) requestAnimationFrame(() => focusCard(state.selectedId));
          }}
        />
      ) : null}
    </section>
  );
}
