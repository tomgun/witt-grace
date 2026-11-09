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
  isValue,
  navigate,
  NAV_KEYS,
  secondaryLinkPath,
} from '../domain/index.ts';
import type { Node, Position } from '../domain/index.ts';
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
import { ClaimPreview, previewHandlers } from './ClaimPreview.tsx';
import { ContextMenu } from './ContextMenu.tsx';
import {
  cardChips,
  displayedPrimaryRelation,
  importanceHint,
  importanceText,
  relationLabel,
  shownInfluence,
  signed,
} from './derive.ts';
import { dropRestoredGhosts } from './fade.ts';
import type { Frame } from './projection.ts';
import { displayShortcut } from './shortcuts.ts';
import type { Shortcuts } from './shortcuts.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import type { Orientation } from './view.ts';

interface Camera {
  x: number;
  y: number;
  scale: number;
}
const ORIENTATION_ARROWS: Record<Orientation, string> = { horizontal: '→', vertical: '↓', 'four-way': '✣' };
const ORIENTATION_KEYS = {
  horizontal: 'leftRight',
  vertical: 'topDown',
  'four-way': 'fourDirections',
} as const;

function InlineEditor({ node, onFinish }: { node: Node; onFinish: (title: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const t = useTranslator();
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
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
  const nodes = frame.projection.nodes;
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const visualPosition = useCallback(
    (node: Node): Position => (live && live.id === node.id ? live.pos : frame.visualPosition(node)),
    [live, frame]
  );

  // ---- camera -------------------------------------------------------------------------------------------------
  const fitViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !nodes.length) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return;
    const points = nodes.map((n) => frame.visualPosition(n));
    const minX = Math.min(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxX = Math.max(...points.map((p) => p.x + CARD_W));
    const maxY = Math.max(...points.map((p) => p.y + H));
    const gap = 100;
    const scale = clamp(Math.min((vw - gap) / (maxX - minX), (vh - gap) / (maxY - minY)), 0.3, 1.15);
    setCamera({
      scale,
      x: (vw - (maxX - minX) * scale) / 2 - minX * scale,
      y: (vh - (maxY - minY) * scale) / 2 - minY * scale,
    });
  }, [nodes, frame, H]);
  const centerNode = useCallback(
    (id: string) => {
      const viewport = viewportRef.current;
      const node = byId.get(id);
      if (!viewport || !node) return;
      const pos = frame.visualPosition(node);
      const { scale } = cameraRef.current;
      setCamera({
        scale,
        x: viewport.clientWidth / 2 - (pos.x + CARD_W / 2) * scale,
        y: viewport.clientHeight / 2 - (pos.y + H / 2) * scale,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frame, H]
  );
  const zoomAround = useCallback((nextScale: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const c = cameraRef.current;
    const scale = clamp(nextScale, 0.25, 2);
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const wx = (px - c.x) / c.scale;
    const wy = (py - c.y) / c.scale;
    setCamera({ scale, x: px - wx * scale, y: py - wy * scale });
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
  const fitRequest = state.fitRequest;
  useEffect(() => {
    const raf = requestAnimationFrame(fitViewport);
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
      zoomAround(cameraRef.current.scale * (e.deltaY > 0 ? 0.93 : 1.07), e.clientX, e.clientY);
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
      if (detail.kind === 'fit') fitViewport();
      else if (detail.kind === 'zoom') zoomCenter(detail.factor ?? 1);
      else setCamera((c) => ({ ...c, x: c.x + (detail.dx ?? 0), y: c.y + (detail.dy ?? 0) }));
    };
    window.addEventListener('witt-camera', onCamera);
    return () => window.removeEventListener('witt-camera', onCamera);
  }, [fitViewport, zoomCenter]);

  // ---- pan ----------------------------------------------------------------------------------------------------
  const pan = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const onViewportPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.node')) return;
    pan.current = { startX: e.clientX, startY: e.clientY, originX: camera.x, originY: camera.y };
    e.currentTarget.classList.add('panning');
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onViewportPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (!p) return;
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
  const beginNodeDrag = (e: ReactPointerEvent<HTMLElement>, node: Node, fromTitle: boolean) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    if (!fromTitle) e.preventDefault();
    e.stopPropagation();
    if (state.selectedId !== node.id || state.selectedLibraryReason) store.select(node.id);
    if (!editable) return;
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
  const points = nodes.map((n) => visualPosition(n));
  const minX = points.length ? Math.min(...points.map((p) => p.x)) - 180 : 0;
  const minY = points.length ? Math.min(...points.map((p) => p.y)) - 180 : 0;
  const maxX = points.length ? Math.max(...points.map((p) => p.x + CARD_W)) + 180 : 8000;
  const maxY = points.length ? Math.max(...points.map((p) => p.y + H)) + 180 : 8000;
  const positionsForEdges = new Map(nodes.map((n) => [n.id, visualPosition(n)]));
  const ids = frame.projection.visibleIds;
  const focusing = view.focus.mode !== 'all';
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
    return [
      <path
        key={child.id}
        className={classes.join(' ')}
        data-focus-stance={focusing ? view.focus.mode : undefined}
        data-importance-delta={
          effect && frame.importance.importantIds.has(child.id) ? String(effect.delta) : undefined
        }
        d={edgeGeometry(parent, child, view.orientation, CARD_W, H, positionsForEdges, frame.directions)}
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
            d={secondaryLinkPath(visualPosition(source), visualPosition(target), CARD_W, H)}
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
    if (
      view.indexMode === 'personal' &&
      node.parentId &&
      node.relation !== 'option' &&
      node.relation !== 'group'
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
    if (H === 94) classes.push('text-only');
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
        style={{ left: pos.x, top: pos.y }}
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
          <span className={`node-tag${l.labels ? '' : ' compact-tag'}`}>{label}</span>
          {node.sharedReasonId ? <small className="shared-node-mark">{t('sharedBadge')}</small> : null}
          {node.reasonConceptId ? <small className="shared-node-mark">{t('contextBadge')}</small> : null}
          {node.semanticType && node.semanticType !== 'unspecified' && !node.sharedReasonId ? (
            <small className="node-semantic">{t(`semantic_${node.semanticType}`)}</small>
          ) : null}
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
        <div
          className="node-title"
          onPointerDown={(e) => {
            if (view.dragFromText) beginNodeDrag(e, node, true);
          }}
        >
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
              requestAnimationFrame(() => focusCard(node.id));
            }}
          />
        ) : null}
      </article>
    );
  };

  const orientationName = t(ORIENTATION_KEYS[view.orientation]);
  const toggleOrientation = () => {
    const order: Orientation[] = ['horizontal', 'vertical', 'four-way'];
    store.setView({ orientation: order[(order.indexOf(view.orientation) + 1) % order.length] });
    store.requestFit();
  };
  return (
    <section className="canvas-area" aria-label={t('tree')} data-testid="canvas">
      <div className="canvas-quick-controls" aria-label={t('viewSettingsButton')}>
        <button
          type="button"
          className="btn quiet"
          id="btnFocusQuick"
          aria-pressed={state.focusOnly}
          title={t(state.focusOnly ? 'exitFocus' : 'focusTree')}
          onClick={() => toggleFocus()}
        >
          ⛶ {t(state.focusOnly ? 'exitFocus' : 'focusTree')}
        </button>
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
      </div>
      <div
        id="viewport"
        ref={viewportRef}
        tabIndex={0}
        aria-label={t('canvasKeyboardHelp')}
        data-testid="viewport"
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
            <g id="edgePaths">
              {edges}
              {linkEdges}
            </g>
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
        <button type="button" id="zoomReset" title={t('fit')} data-testid="fit" onClick={fitViewport}>
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
