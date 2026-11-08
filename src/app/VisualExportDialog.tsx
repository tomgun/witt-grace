// "Vie puu kuvaksi tai PDF:ksi" (UI_INVENTORY S-11.4, inv-files §D): the same options, estimate and download as the
// prototype; the drawing itself lives in src/lib/export and never touches the document.
import { useEffect, useMemo, useState } from 'react';
import { isAiProfile } from '../domain/index.ts';
import type { Node } from '../domain/index.ts';
import {
  defaultVisualExportOptions,
  resolveExportLayers,
  runVisualExport,
  visualExportEstimate,
} from '../lib/export/diagram.ts';
import type { ExportLayers, SnapshotInput, VisualExportOptions } from '../lib/export/diagram.ts';
import {
  cardChips,
  displayedPrimaryRelation,
  relationLabel,
  shownInfluence,
  viewedAssessorId,
} from './derive.ts';
import { Modal } from './dialogs.tsx';
import type { Frame } from './projection.ts';
import { getStore, useAppState, useTranslator } from './store.ts';
import { LAYER_PRESETS } from './view.ts';
import type { Translator } from '../lib/i18n/i18n.ts';

/** Everything the export drawing needs from the current frame, with the app's own labels and chips. */
export function snapshotInput(frame: Frame, t: Translator, options: VisualExportOptions): SnapshotInput {
  const { project, view, actorId } = frame;
  const layers = resolveExportLayers(options.detail, view.layers, LAYER_PRESETS);
  const personal = view.indexMode === 'personal';
  const assessor = project.users.find((u) => u.id === viewedAssessorId(project, view, actorId));
  const viewpoint = personal ? (assessor?.name ?? t('indexPersonal')) : t('indexShared');
  return {
    project,
    options,
    layers,
    projection: {
      nodes: frame.projection.nodes,
      matchIds: frame.projection.matchIds,
      anchorId: frame.projection.anchorId,
      contextIds: frame.projection.contextIds,
    },
    focusActive: view.focus.mode !== 'all',
    orientation: view.orientation,
    fourWayOffsets: project.layout.fourWayOffsets,
    personal,
    lensFiltered: frame.lens.filtered,
    evaluated: personal ? frame.personalScores : frame.scores,
    leadingOptionIds: frame.leadingOptionIds,
    relation: (node: Node) => displayedPrimaryRelation(frame, node),
    typeLabel: (node: Node) => relationLabel(frame, t, node),
    chips: (node: Node, l: ExportLayers) =>
      cardChips(frame, t, node, { ...l }, frame.importance).map((chip) => `${chip.label}: ${chip.value}`),
    shownInfluence: (node: Node) => shownInfluence(frame, node),
    title: project.title,
    subtitle: `WITT · GRACE · ${t(project.mode === 'decision' ? 'modeDecision' : 'modeArgument')} · ${viewpoint}${
      assessor && personal && isAiProfile(assessor) ? ' · AI' : ''
    }`,
  };
}

export function VisualExportDialog({ frame }: { frame: Frame }) {
  const state = useAppState();
  const t = useTranslator();
  const store = getStore();
  const { project, view } = state;
  const [options, setOptions] = useState<VisualExportOptions>(() =>
    defaultVisualExportOptions({
      appearance: state.appearance,
      showImportance: view.showImportance,
      highlightOptions: view.highlightOptions,
      leadingOptionCount: frame.leadingOptionIds.size,
      layers: view.layers,
      showRecurringInTree: view.showRecurringInTree,
      compactVisible: view.depthLimit !== null ? view.depthCompact : view.compactVisible,
      anyCollapsed: project.nodes.some((n) => n.collapsed),
    })
  );
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const estimate = useMemo(
    () =>
      visualExportEstimate(
        t,
        () => snapshotInput(frame, t, options),
        options,
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      ),
    [frame, t, options]
  );
  useEffect(() => {
    document.getElementById('exportFormat')?.focus();
  }, []);
  const set = <K extends keyof VisualExportOptions>(key: K, value: VisualExportOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));
  const download = async () => {
    setBusy(true);
    setStatus(t('exportBusy'));
    const result = await runVisualExport(t, snapshotInput(frame, t, options), options);
    setStatus(result);
    setBusy(false);
  };
  const close = () => store.openDialog(null);
  return (
    <Modal
      open
      onClose={close}
      title={t('exportVisualTitle')}
      id="visualExportDialog"
      testId="visual-export-dialog"
      className=""
    >
      <div id="visualExportForm">
        <p>{t('exportVisualHelp')}</p>
        <div className="visual-export-grid">
          <label>
            <span>{t('exportFormat')}</span>
            <select
              id="exportFormat"
              value={options.format}
              onChange={(e) => set('format', e.target.value as VisualExportOptions['format'])}
            >
              <option value="png">PNG</option>
              <option value="svg">SVG</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <label>
            <span>{t('exportScope')}</span>
            <select
              id="exportScope"
              value={options.scope}
              onChange={(e) => set('scope', e.target.value as VisualExportOptions['scope'])}
            >
              <option value="visible">{t('exportVisible')}</option>
              <option value="all">{t('exportWhole')}</option>
            </select>
          </label>
          <label>
            <span>{t('exportDetail')}</span>
            <select
              id="exportDetail"
              value={options.detail}
              onChange={(e) => set('detail', e.target.value as VisualExportOptions['detail'])}
            >
              <option value="current">{t('exportCurrent')}</option>
              <option value="text">{t('compactView')}</option>
              <option value="analysis">{t('analysis')}</option>
              <option value="all">{t('allDetails')}</option>
            </select>
          </label>
          <label>
            <span>{t('exportPalette')}</span>
            <select
              id="exportPalette"
              value={options.palette}
              onChange={(e) => set('palette', e.target.value as VisualExportOptions['palette'])}
            >
              <option value="light">{t('exportLight')}</option>
              <option value="dark">{t('exportDark')}</option>
            </select>
          </label>
        </div>
        <div className="visual-export-toggles">
          <label>
            <input
              type="checkbox"
              id="exportHighlights"
              checked={options.highlights}
              onChange={(e) => set('highlights', e.target.checked)}
            />
            <span>{t('importantHighlight')}</span>
          </label>
          <label>
            <input
              type="checkbox"
              id="exportLinks"
              checked={options.links}
              onChange={(e) => set('links', e.target.checked)}
            />
            <span>{t('layerLinks')}</span>
          </label>
          <label>
            <input
              type="checkbox"
              id="exportShared"
              checked={options.shared}
              onChange={(e) => set('shared', e.target.checked)}
            />
            <span>{t('sharedShowInTree')}</span>
          </label>
          <label>
            <input
              type="checkbox"
              id="exportCompact"
              checked={options.compact}
              onChange={(e) => set('compact', e.target.checked)}
            />
            <span>{t('exportCompactVisible')}</span>
          </label>
        </div>
        <div id="exportPngOptions" hidden={options.format !== 'png'}>
          <label>
            <span>{t('exportResolution')}</span>
            <select
              id="exportResolution"
              value={String(options.resolution)}
              onChange={(e) => set('resolution', Number(e.target.value) as VisualExportOptions['resolution'])}
            >
              <option value="1">1×</option>
              <option value="2">2×</option>
              <option value="3">3×</option>
            </select>
          </label>
          <label>
            <span>{t('exportPngMode')}</span>
            <select
              id="exportPngMode"
              value={options.pngMode}
              onChange={(e) => set('pngMode', e.target.value as VisualExportOptions['pngMode'])}
            >
              <option value="auto">{t('exportPngAuto')}</option>
              <option value="tiles">{t('exportPngTiles')}</option>
            </select>
          </label>
          <p className="export-png-hint" id="exportPngEstimate" role="status">
            {estimate}
          </p>
          <p className="export-png-hint">{t('exportPngTileHint')}</p>
        </div>
        <div id="exportPdfOptions" hidden={options.format !== 'pdf'}>
          <label>
            <span>{t('exportPdfLayout')}</span>
            <select
              id="exportPdfLayout"
              value={options.pdfLayout}
              onChange={(e) => set('pdfLayout', e.target.value as VisualExportOptions['pdfLayout'])}
            >
              <option value="pages-auto">{t('exportPdfPages')}</option>
              <option value="pages-portrait">{t('exportPdfPortrait')}</option>
              <option value="pages-landscape">{t('exportPdfLandscape')}</option>
              <option value="fit">{t('exportPdfFit')}</option>
            </select>
          </label>
        </div>
        <p className="inline-warning" id="exportVisualStatus" role="status">
          {status}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn quiet" id="btnExportCancel" onClick={close}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            id="btnExportDownload"
            disabled={busy}
            onClick={() => void download()}
          >
            {t('exportDownload')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
