// The visual export of the tree as PNG (one image or a ZIP of tiles), SVG or a multi-page PDF, as the prototype's
// "Vie kuva / PDF" dialog: the dialog defaults, the size estimate, the filename and the download itself. Exporting
// never mutates the document or the saved view. The drawing is export-specific (svg.ts), not a screenshot.
import type { Translator } from '../i18n/i18n.ts';
import { pdfBlob } from './pdf.ts';
import { pngExport, pngPlan } from './png.ts';
import type { PngExportResult } from './png.ts';
import { download } from './raster.ts';
import { buildVisualSnapshot } from './snapshot.ts';
import type { ExportLayers, SnapshotInput, VisualExportOptions } from './snapshot.ts';
import { renderSvg } from './svg.ts';
import type { ExportPalette, ExportSnapshot, RenderedSvg } from './svg.ts';

export type {
  ExportDetail,
  ExportFormat,
  ExportLayers,
  ExportScope,
  SnapshotInput,
  VisualExportOptions,
} from './snapshot.ts';
export {
  EXPORT_DETAILS,
  EXPORT_FORMATS,
  EXPORT_SCOPES,
  buildVisualSnapshot,
  exportLayoutHeight,
  highlightedChildren,
  resolveExportLayers,
} from './snapshot.ts';
export type { ExportPalette, ExportSnapshot, RenderedSvg, SnapshotEdge, SnapshotNode } from './svg.ts';
export { renderSvg, wrapLines, exportCardHeight, svgBounds, tileSvg, sizeSvg } from './svg.ts';
export type { PngMode, PngPlan, PngScale, PngTile, PngTilePlan, PngExportResult } from './png.ts';
export { PNG_SCALES, pngPlan, pngTilePlan, pngTileEntries, pngBlob, pngExport } from './png.ts';
export type { PdfLayout, PdfOrientation, PdfPage, PdfTile } from './pdf.ts';
export { PDF_LAYOUTS, pdfOrientation, pdfTilePlan, pdfFitRasterSize, pdfBytes, pdfBlob } from './pdf.ts';
export type { ZipEntry } from './zip.ts';
export { crc32, zipStored, zipStoredBytes } from './zip.ts';
export { download } from './raster.ts';

/** Skins the export dialog treats as dark when choosing its default palette. */
export const DARK_APPEARANCES = ['dark', 'cosmos', 'hologram', 'bitberg', 'terminal'];

export interface ExportDefaultsInput {
  /** The effective appearance (document theme or browser skin). */
  appearance: string;
  showImportance: boolean;
  highlightOptions: boolean;
  leadingOptionCount: number;
  layers: ExportLayers;
  showRecurringInTree: boolean;
  /** `view.depthLimit !== null ? view.depthCompact : view.compactVisible`. */
  compactVisible: boolean;
  /** Any node is collapsed in the document. */
  anyCollapsed: boolean;
}
/** The dialog's initial choices, as `openVisualExport` sets them. */
export function defaultVisualExportOptions(input: ExportDefaultsInput): VisualExportOptions {
  return {
    format: 'png',
    scope: 'visible',
    detail: 'current',
    palette: DARK_APPEARANCES.includes(input.appearance) ? 'dark' : 'light',
    highlights: input.showImportance || (input.highlightOptions && input.leadingOptionCount > 0),
    links: !!input.layers.links,
    shared: input.showRecurringInTree,
    compact: input.compactVisible || input.anyCollapsed,
    resolution: 2,
    pngMode: 'auto',
    pdfLayout: 'pages-auto',
  };
}

/** The PNG size line: "W × H px · M.M MP · raakamuisti vähintään N Mt · Yritetään yhtä PNG:tä" (or the ZIP note). */
export function pngEstimateText(
  t: Translator,
  svg: Pick<RenderedSvg, 'width' | 'height'>,
  options: Pick<VisualExportOptions, 'resolution' | 'pngMode'>,
  deviceMemory?: number
): string {
  const plan = pngPlan(svg.width, svg.height, Number(options.resolution), options.pngMode, deviceMemory);
  return (
    t('exportPngSize', {
      width: plan.width,
      height: plan.height,
      megapixels: (plan.pixels / 1e6).toFixed(1),
      mb: Math.ceil(plan.estimatedRGBABytes / 1e6),
    }) +
    ' · ' +
    t(plan.single ? 'exportPngSingleAttempt' : 'exportPngZipFallback')
  );
}
/** The estimate the dialog shows for the current choices: empty unless PNG; an error's message replaces it. */
export function visualExportEstimate(
  t: Translator,
  snapshot: () => SnapshotInput,
  options: VisualExportOptions,
  deviceMemory?: number
): string {
  if (options.format !== 'png') return '';
  try {
    return pngEstimateText(t, renderSvg(buildVisualSnapshot(snapshot())), options, deviceMemory);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The download name without extension: NFKC title, letters/digits/space/_/- kept, spaces to `_`, 65 chars max. */
export function visualExportBasename(title: string): string {
  return (
    (title || 'witt')
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9_\-\p{L}\p{N} ]/gu, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 65) || 'witt'
  );
}

export interface VisualExportFile {
  blob: Blob;
  filename: string;
  /** The status line after the export ("Tiedosto ladattu." or the tile note); empty for a ZIP without a note. */
  status: string;
}
/** The browser encoders, replaceable in tests. */
export interface VisualExportDeps {
  pngExport: (
    svg: string,
    width: number,
    height: number,
    scale: number,
    mode: string
  ) => Promise<PngExportResult>;
  pdfBlob: (svg: string, width: number, height: number, layout: string) => Promise<Blob>;
}
/** Produce the file for the chosen format from a rendered snapshot; the caller downloads it (`download`). */
export async function visualExportFile(
  t: Translator,
  snapshot: ExportSnapshot,
  options: VisualExportOptions,
  title: string,
  deps: VisualExportDeps = { pngExport, pdfBlob }
): Promise<VisualExportFile> {
  const { svg, width, height } = renderSvg(snapshot);
  const name = visualExportBasename(title);
  const kind = options.format;
  let status = t('exportReady');
  let file: Blob;
  let extension: string = kind;
  if (kind === 'svg') file = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  else if (kind === 'png') {
    const result: PngExportResult = await deps.pngExport(
      svg,
      width,
      height,
      Number(options.resolution),
      options.pngMode
    );
    file = result.blob;
    if (result.tiled) {
      extension = 'zip';
      status =
        t('exportPngTiled', { count: result.tiles }) +
        (result.fallbackReason ? ' · ' + t('exportPngBrowserLimit') : '');
    }
  } else if (kind === 'pdf') file = await deps.pdfBlob(svg, width, height, options.pdfLayout);
  else throw new Error('Invalid format');
  return { blob: file, filename: `${name}.${extension}`, status };
}
/** The whole "Lataa tiedosto" action: build, render, encode and download. Returns the status line to show; a
 * failure returns "Toiminto epäonnistui.: <message>" as the prototype. */
export async function runVisualExport(
  t: Translator,
  input: SnapshotInput,
  options: VisualExportOptions,
  deps: VisualExportDeps & { download: typeof download } = { pngExport, pdfBlob, download }
): Promise<string> {
  try {
    const result = await visualExportFile(t, buildVisualSnapshot(input), options, input.title, deps);
    deps.download(result.blob, result.filename);
    return result.status;
  } catch (error) {
    return `${t('operationFailed')}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const paletteForAppearance = (appearance: string): ExportPalette =>
  DARK_APPEARANCES.includes(appearance) ? 'dark' : 'light';
