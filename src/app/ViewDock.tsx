// Näkymäasetukset: the floating, draggable dock with layers, tree tools, depth slider and branch focus (inv-panels §E).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { arrangeTree, toggleCompactVisible, toggleOptionBranches } from './actions.ts';
import { canEdit } from './actions.ts';
import type { Frame } from './projection.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import { LAYER_NAMES, LAYER_PRESETS, currentPreset } from './view.ts';
import type { FocusMode, LayerName, LayerPreset, Orientation } from './view.ts';

const LAYER_KEYS: Record<
  LayerName,
  | 'layerLabels'
  | 'layerDetails'
  | 'layerIndex'
  | 'layerAssessments'
  | 'layerConfidence'
  | 'layerImpact'
  | 'layerComments'
  | 'layerCounts'
  | 'layerLinks'
> = {
  labels: 'layerLabels',
  details: 'layerDetails',
  index: 'layerIndex',
  assessments: 'layerAssessments',
  confidence: 'layerConfidence',
  impact: 'layerImpact',
  comments: 'layerComments',
  counts: 'layerCounts',
  links: 'layerLinks',
};

export function ViewDock({ frame, anchorId }: { frame: Frame; anchorId: string }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view } = state;
  const [layersOpen, setLayersOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const safeTop = () => {
    const toolbar = document.querySelector<HTMLElement>('.toolbar');
    const anchor = toolbar && toolbar.offsetParent ? toolbar : document.querySelector<HTMLElement>('.topbar');
    const bottom = anchor ? anchor.getBoundingClientRect().bottom + 7 : 8;
    return Math.max(8, Math.min(bottom, window.innerHeight - 48));
  };
  const place = () => {
    const panel = ref.current;
    if (!panel) return;
    const minTop = safeTop();
    const avail = Math.max(110, window.innerHeight - minTop - 8);
    panel.style.maxHeight = `${window.innerWidth <= 760 ? Math.min(420, avail) : avail}px`;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    if (view.dockScreenPosition) {
      setPos({
        left: Math.max(8, Math.min(view.dockScreenPosition.x, window.innerWidth - w - 8)),
        top: Math.max(minTop, Math.min(view.dockScreenPosition.y, window.innerHeight - h - 8)),
      });
      return;
    }
    const anchor = document.getElementById(anchorId)?.getBoundingClientRect();
    if (!anchor) {
      setPos({ left: 8, top: minTop });
      return;
    }
    const below = anchor.bottom + 7;
    const top =
      below + h <= window.innerHeight - 8 || anchor.top - h - 7 < minTop ? below : anchor.top - h - 7;
    setPos({
      left: Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8)),
      top: Math.max(minTop, top),
    });
  };
  useLayoutEffect(place, [view.dockScreenPosition, view.dockCollapsed, layersOpen, anchorId]);
  useEffect(() => {
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  });
  useEffect(() => {
    document.getElementById('viewPreset')?.focus();
  }, []);

  const remember = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) store.setView({ dockScreenPosition: { x: rect.left, y: rect.top } });
  };
  const onHandlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    const panel = ref.current;
    if (!panel) return;
    const handle = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY, left: panel.offsetLeft, top: panel.offsetTop };
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const minTop = safeTop();
      setPos({
        left: Math.max(
          8,
          Math.min(start.left + ev.clientX - start.x, window.innerWidth - panel.offsetWidth - 8)
        ),
        top: Math.max(
          minTop,
          Math.min(start.top + ev.clientY - start.y, window.innerHeight - panel.offsetHeight - 8)
        ),
      });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      remember();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };
  const onHandleKey = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-24, 0],
      ArrowRight: [24, 0],
      ArrowUp: [0, -24],
      ArrowDown: [0, 24],
    };
    const d = step[e.key];
    if (!d || !pos) return;
    e.preventDefault();
    const next = { left: pos.left + d[0], top: pos.top + d[1] };
    setPos(next);
    store.setView({ dockScreenPosition: { x: next.left, y: next.top } });
  };

  const preset = currentPreset(view.layers);
  const setPreset = (value: string) => {
    if (value in LAYER_PRESETS) {
      store.setView({ layers: { ...LAYER_PRESETS[value as LayerPreset] } });
      store.requestFit();
    }
  };
  const options = project.nodes.filter(
    (n) => n.relation === 'option' && project.nodes.some((c) => c.parentId === n.id)
  );
  const anyOpen = options.some((n) => !frame.isNodeCollapsed(n));
  const compactPressed = view.depthLimit !== null ? view.depthCompact : view.compactVisible;
  const depthValue = Math.min(view.depthLimit ?? frame.maxDepth, frame.maxDepth);
  const anchor =
    project.nodes.find((n) => n.id === view.focus.anchorId) ?? project.nodes.find((n) => n.parentId === null);
  const setFocusMode = (mode: FocusMode) => {
    const patch: Parameters<typeof store.setView>[0] = { focus: { ...view.focus, mode } };
    if (view.focus.mode === 'all' && mode !== 'all') patch.focus = { mode, anchorId: state.selectedId };
    store.setExplicitlyClosed(new Set());
    store.setView(patch);
    store.requestFit();
  };
  const isTable = view.presentation === 'table';
  return (
    <div
      id="viewDock"
      ref={ref}
      className={`view-dock${view.dockCollapsed ? ' is-collapsed' : ''}`}
      aria-label={t('viewSettingsButton')}
      style={pos ? { left: pos.left, top: pos.top } : undefined}
      data-testid="view-dock"
    >
      <div className="dock-topline">
        <span
          className="dock-drag-handle"
          id="dockMove"
          tabIndex={0}
          role="button"
          title={t('dockMove')}
          onPointerDown={onHandlePointerDown}
          onKeyDown={onHandleKey}
          onDoubleClick={() => store.setView({ dockScreenPosition: null })}
        >
          ⠿ <span>{t('viewSettingsButton')}</span>
        </span>
        <div className="dock-action-buttons">
          <button
            type="button"
            id="btnDockCollapse"
            className="btn quiet"
            title={t(view.dockCollapsed ? 'dockRestore' : 'dockCollapse')}
            aria-expanded={!view.dockCollapsed}
            onClick={() => store.setView({ dockCollapsed: !view.dockCollapsed })}
          >
            {view.dockCollapsed ? '▣' : '−'}
          </button>
          <button
            type="button"
            id="btnDockClose"
            className="btn quiet dock-close"
            title={t('dockClose')}
            aria-label={t('dockClose')}
            onClick={() => {
              store.setView({ dockHidden: true });
              document.getElementById(anchorId)?.focus();
            }}
          >
            ×
          </button>
        </div>
      </div>
      <div className="dock-content" id="dockContent">
        <div className="dock-row">
          <span className="dock-label">{t('layers')}</span>
          <label className="visually-hidden" htmlFor="viewPreset">
            {t('viewScope')}
          </label>
          <select
            id="viewPreset"
            aria-label={t('viewScope')}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            <option value="text">{t('compactView')}</option>
            <option value="analysis">{t('analysis')}</option>
            <option value="all">{t('allDetails')}</option>
            <option value="custom">{t('custom')}</option>
          </select>
          <button
            type="button"
            id="btnLayers"
            className="btn quiet dock-button"
            aria-controls="layersPanel"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((v) => !v)}
          >
            {t('customize')}
          </button>
        </div>
        <div
          id="layersPanel"
          className="layers-panel"
          role="group"
          aria-label={t('layers')}
          hidden={!layersOpen}
        >
          <p>{t('layersHelp')}</p>
          {LAYER_NAMES.map((layer) => (
            <label key={layer}>
              <input
                type="checkbox"
                data-layer={layer}
                checked={view.layers[layer]}
                onChange={(e) => {
                  store.setView({
                    layers: { [layer]: e.target.checked } as Partial<
                      typeof view.layers
                    > as typeof view.layers,
                  });
                  store.requestFit();
                }}
              />
              <span>{t(LAYER_KEYS[layer])}</span>
            </label>
          ))}
          <label>
            <input
              id="showSharedReasons"
              type="checkbox"
              checked={view.showRecurringInTree}
              onChange={(e) => store.setView({ showRecurringInTree: e.target.checked })}
            />
            <span>{t('sharedShowInTree')}</span>
          </label>
          <label>
            <input
              id="dragFromText"
              type="checkbox"
              checked={view.dragFromText}
              onChange={(e) => store.setView({ dragFromText: e.target.checked })}
            />
            <span>{t('dragFromText')}</span>
          </label>
        </div>
        <div className="dock-tree-tools">
          <label htmlFor="orientationSelect">{t('orientation')}</label>
          <select
            id="orientationSelect"
            aria-label={t('orientation')}
            title={t('orientation')}
            value={view.orientation}
            disabled={isTable}
            onChange={(e) => {
              store.setView({ orientation: e.target.value as Orientation });
              store.requestFit();
            }}
          >
            <option value="horizontal">→ {t('leftRight')}</option>
            <option value="vertical">↓ {t('topDown')}</option>
            <option value="four-way">✣ {t('fourDirections')}</option>
          </select>
          <button
            type="button"
            id="btnLayout"
            className="btn quiet"
            disabled={isTable}
            title={`${t('arrange')} (Alt+A)`}
            onClick={arrangeTree}
          >
            {t('arrange')}
          </button>
          <button
            type="button"
            id="btnFit"
            className="btn quiet"
            disabled={isTable}
            onClick={() => store.requestFit()}
          >
            {t('fit')}
          </button>
          <button
            type="button"
            id="btnCompactTree"
            className="btn quiet"
            aria-pressed={compactPressed}
            onClick={toggleCompactVisible}
          >
            {t(view.depthLimit !== null && view.depthCompact ? 'restoreManualLayout' : 'compactVisibleTree')}
          </button>
          {project.mode === 'decision' ? (
            <button
              type="button"
              id="btnCollapseOptions"
              className="btn quiet"
              title={t('collapseOptionsShortcut')}
              disabled={!options.length || (!canEdit(state) && view.depthLimit === null)}
              onClick={toggleOptionBranches}
            >
              {t(anyOpen ? 'collapseAllOptions' : 'expandAllOptions')}
            </button>
          ) : null}
        </div>
        <div className="dock-depth-tools">
          <div className="dock-depth-heading">
            <label htmlFor="treeDepthSlider">{t('treeDepthLabel')}</label>
            <output id="treeDepthValue" htmlFor="treeDepthSlider" aria-live="polite">
              {view.depthLimit === null
                ? t('treeDepthManual')
                : t('treeDepthPosition', { depth: depthValue, total: frame.maxDepth })}
            </output>
          </div>
          <input
            id="treeDepthSlider"
            type="range"
            min={0}
            max={frame.maxDepth}
            step={1}
            value={depthValue}
            aria-label={t('treeDepthLabel')}
            onChange={(e) => {
              store.setDepthOverrides(new Map());
              store.setView({ depthLimit: Number(e.target.value) });
              store.requestFit();
            }}
          />
          <div className="dock-depth-extremes">
            <span>{t('treeDepthRoot')}</span>
            <span>{t('treeDepthAll')}</span>
          </div>
          {view.depthLimit !== null ? (
            <button
              type="button"
              id="btnDepthReset"
              className="btn quiet"
              onClick={() => {
                store.setDepthOverrides(new Map());
                store.setView({ depthLimit: null });
                store.requestFit();
              }}
            >
              {t('treeDepthReset')}
            </button>
          ) : null}
        </div>
        <div className="dock-divider" />
        <div className="dock-row focus-head">
          <span className="dock-label">{t('focusHeading')}</span>
          <div className="focus-segments" role="group" aria-label={t('focusHeading')}>
            {(['all', 'support', 'oppose'] as FocusMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                id={mode === 'all' ? 'focusAll' : mode === 'support' ? 'focusSupport' : 'focusOppose'}
                data-focus={mode}
                className={view.focus.mode === mode ? 'active' : ''}
                aria-pressed={view.focus.mode === mode}
                onClick={() => setFocusMode(mode)}
              >
                {t(mode === 'all' ? 'all' : mode === 'support' ? 'focusSupport' : 'focusOppose')}
              </button>
            ))}
          </div>
        </div>
        <div className="focus-target">
          <button
            type="button"
            id="btnFocusAnchor"
            className="btn quiet dock-button"
            onClick={() => {
              store.setExplicitlyClosed(new Set());
              store.setView({ focus: { ...view.focus, anchorId: state.selectedId } });
              if (view.focus.mode !== 'all') store.requestFit();
            }}
          >
            {t('selectedBranch')}
          </button>
          <span id="focusAnchorText" title={anchor ? t('startPoint', { name: anchor.title }) : undefined}>
            {anchor?.parentId === null ? t('wholeTree') : (anchor?.title ?? '')}
          </span>
        </div>
        <p className="focus-summary" id="focusSummary" role="status">
          {view.focus.mode === 'all'
            ? t('focusIdle')
            : t('focusMatches', {
                kind: t(view.focus.mode === 'support' ? 'focusSupport' : 'focusOppose'),
                count: frame.projection.matches,
                peek: frame.projection.peekIds.size,
              })}
        </p>
      </div>
    </div>
  );
}
