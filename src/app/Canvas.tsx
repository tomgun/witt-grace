import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { displayedStance, visibleNodes } from '../domain/index.ts';
import type { Node, Scores } from '../domain/index.ts';
import { balanceText, pairText } from './format.ts';
import { getStore, useAppState, useTranslator } from './store.ts';

export const CARD_W = 252;
export const CARD_H = 154;

function edgePath(from: Node, to: Node): string {
  const sx = from.position.x + CARD_W;
  const sy = from.position.y + CARD_H / 2;
  const ex = to.position.x;
  const ey = to.position.y + CARD_H / 2;
  const bend = Math.max(40, Math.abs(ex - sx) * 0.45);
  return `M${sx} ${sy} C${sx + bend} ${sy} ${ex - bend} ${ey} ${ex} ${ey}`;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** The tree as cards on a pannable, zoomable surface. View state never touches the document; drags end in one command. */
export function Canvas({ scores }: { scores: Scores }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project } = state;
  const [camera, setCamera] = useState<Camera>({ x: 40, y: 40, zoom: 1 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: 'pan' | 'node';
    id?: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const nodes = visibleNodes(project);
  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const visible = new Set(nodes.map((n) => n.id));

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport || !nodes.length) return;
    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minY = Math.min(...nodes.map((n) => n.position.y));
    const maxX = Math.max(...nodes.map((n) => n.position.x + CARD_W));
    const maxY = Math.max(...nodes.map((n) => n.position.y + CARD_H));
    const zoom = Math.min(
      1.2,
      Math.max(
        0.25,
        Math.min((viewport.clientWidth - 80) / (maxX - minX), (viewport.clientHeight - 80) / (maxY - minY))
      )
    );
    setCamera({ zoom, x: 40 - minX * zoom, y: 40 - minY * zoom });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, nodeId?: string) => {
    if (e.button !== 0) return;
    const node = nodeId ? byId.get(nodeId) : undefined;
    drag.current = {
      kind: node ? 'node' : 'pan',
      id: nodeId,
      startX: e.clientX,
      startY: e.clientY,
      originX: node ? node.position.x : camera.x,
      originY: node ? node.position.y : camera.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (nodeId) store.select(nodeId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.kind === 'pan') setCamera((c) => ({ ...c, x: d.originX + dx, y: d.originY + dy }));
    else if (d.id) setDragOffset({ id: d.id, dx: dx / camera.zoom, dy: dy / camera.zoom });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'node' && d.id && d.moved && dragOffset) {
      store.dispatch({
        type: 'node.position',
        positions: {
          [d.id]: { x: Math.round(d.originX + dragOffset.dx), y: Math.round(d.originY + dragOffset.dy) },
        },
      });
    }
    setDragOffset(null);
  };
  const zoomBy = (factor: number) =>
    setCamera((c) => ({ ...c, zoom: Math.min(2.5, Math.max(0.2, c.zoom * factor)) }));
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  const position = (node: Node) =>
    dragOffset && dragOffset.id === node.id
      ? { x: node.position.x + dragOffset.dx, y: node.position.y + dragOffset.dy }
      : node.position;

  return (
    <section className="canvas-area" aria-label={t('tree')} data-testid="canvas">
      <div
        id="viewport"
        ref={viewportRef}
        tabIndex={0}
        aria-label={t('canvasKeyboardHelp')}
        data-testid="viewport"
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            zoomBy(1.1);
          } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
            e.preventDefault();
            zoomBy(1 / 1.1);
          } else if (e.key === '0' && !e.ctrlKey && !e.metaKey) fit();
          else if (e.altKey && e.key.startsWith('Arrow')) {
            e.preventDefault();
            const step = 60;
            setCamera((c) => ({
              ...c,
              x: c.x + (e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0),
              y: c.y + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0),
            }));
          }
        }}
      >
        <div
          className="world"
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
        >
          <svg className="edges" aria-hidden="true" width={8000} height={8000} viewBox="0 0 8000 8000">
            {nodes.map((child) => {
              if (!child.parentId || !visible.has(child.parentId)) return null;
              const parent = byId.get(child.parentId);
              if (!parent) return null;
              const stance = displayedStance(project, child, state.actorId);
              return (
                <path
                  key={child.id}
                  className={`edge edge-${stance}`}
                  d={edgePath(
                    { ...parent, position: position(parent) },
                    { ...child, position: position(child) }
                  )}
                />
              );
            })}
          </svg>
          <div role="tree" aria-label={t('tree')}>
            {nodes.map((node) => {
              const score = scores.get(node.id);
              const stance = displayedStance(project, node, state.actorId);
              const own = project.votes.find((v) => v.nodeId === node.id && v.userId === state.actorId);
              const ownEdge = project.edgeAssessments.find(
                (a) => a.subjectType === 'primary' && a.subjectId === node.id && a.userId === state.actorId
              );
              const pos = position(node);
              const isRoot = node.parentId === null;
              return (
                <article
                  key={node.id}
                  role="treeitem"
                  aria-selected={state.selectedId === node.id}
                  aria-level={1}
                  tabIndex={state.selectedId === node.id ? 0 : -1}
                  className={`node${state.selectedId === node.id ? ' selected' : ''}${isRoot ? ' is-root' : ''}`}
                  data-relation={isRoot ? 'root' : stance}
                  data-testid={`node-${node.id}`}
                  style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onPointerDown(e, node.id);
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  <div className="node-header">
                    <span className="node-tag">
                      {isRoot
                        ? t('rootNote')
                        : node.kind === 'option'
                          ? t('optionWord')
                          : stance === 'support'
                            ? t('supportWord')
                            : stance === 'oppose'
                              ? t('opposeWord')
                              : t('neutralWord')}
                    </span>
                    {node.reasonConceptId ? <span className="node-badge">{t('contextBadge')}</span> : null}
                    {state.view.showAuthors ? (
                      <span className="node-author">
                        {project.users.find((u) => u.id === node.createdBy)?.name}
                      </span>
                    ) : null}
                  </div>
                  <div className="node-title">{node.title}</div>
                  <div className="node-meta">
                    <span
                      className="meta-balance"
                      data-testid={`balance-${node.id}`}
                      title={score?.incomplete ? t('balanceIncomplete') : t('layerIndex')}
                    >
                      {t('layerIndex')} {balanceText(score?.balance ?? null)}
                      {score?.incomplete ? ' *' : ''}
                    </span>
                    {node.kind === 'claim' && !isRoot ? (
                      <span
                        className="meta-pair"
                        data-testid={`pair-${node.id}`}
                        title={t('layerAssessments')}
                      >
                        {pairText(
                          own ? own.confidence : null,
                          ownEdge && ownEdge.fingerprint ? ownEdge.influence : null
                        )}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
      <div className="zoom-controls">
        <button type="button" onClick={() => zoomBy(1 / 1.1)} title={t('zoomOut')} aria-label={t('zoomOut')}>
          −
        </button>
        <span data-testid="zoom-label">{Math.round(camera.zoom * 100)} %</span>
        <button type="button" onClick={() => zoomBy(1.1)} title={t('zoomIn')} aria-label={t('zoomIn')}>
          +
        </button>
        <button type="button" onClick={fit} title={t('fit')} data-testid="fit">
          {t('fit')}
        </button>
        <button
          type="button"
          onClick={() => store.dispatch({ type: 'layout.auto' })}
          title={t('arrange')}
          data-testid="arrange"
        >
          {t('arrange')}
        </button>
      </div>
      <div className="legend">
        <span>
          <i className="support-mark" /> {t('supportWord')}
        </span>
        <span>
          <i className="oppose-mark" /> {t('opposeWord')}
        </span>
        {project.mode === 'decision' ? (
          <span>
            <i className="option-mark" /> {t('optionWord')}
          </span>
        ) : null}
      </div>
    </section>
  );
}
