// PNG export: one image when the browser can hold it, else bounded tiles in a ZIP. The planning (size, pixel budget,
// tiling grid, tile names, the README manifest) is pure and pinned against the prototype; only the canvas work needs
// a browser.
import { blobFor, canvasFor, imageFromSvg } from './raster.ts';
import { tileSvg } from './svg.ts';
import { zipStored } from './zip.ts';
import type { ZipEntry } from './zip.ts';

export type PngMode = 'auto' | 'tiles';
export type PngScale = 1 | 2 | 3;
export const PNG_SCALES: PngScale[] = [1, 2, 3];
/** A full canvas is expensive even when the PNG on disk is small: up to 100 MP (~400 MB RGBA) on ordinary devices,
 * 48 MP when the browser reports at most 4 GiB. Larger trees fall back to tiles. */
export const PNG_SINGLE_MAX_PIXELS = 100000000;
export const PNG_LOW_MEMORY_MAX_PIXELS = 48000000;
export const PNG_SINGLE_MAX_SIDE = 32767;
/** Tile edge: ~12.8 MP per canvas, comfortably below browser limits. */
export const PNG_TILE = 3584;
export const PNG_MAX_TILES = 144;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const clampScale = (scale: number): number => clamp(Number(scale) || 1, 1, 3);

export interface PngPlan {
  width: number;
  height: number;
  pixels: number;
  estimatedRGBABytes: number;
  /** One PNG will be attempted (mode allows it, sides and pixel budget fit). */
  single: boolean;
}
/** Output size and the single-vs-tiles decision for an SVG of `width × height` at `scale`. */
export function pngPlan(
  width: number,
  height: number,
  scale: number = 2,
  mode: PngMode | string = 'auto',
  memoryGiB?: number
): PngPlan {
  const s = clampScale(scale);
  const w = Math.round(width * s);
  const h = Math.round(height * s);
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w <= 0 || h <= 0)
    throw new Error('Invalid PNG dimensions');
  const pixels = w * h;
  const budget =
    Number(memoryGiB) > 0 && Number(memoryGiB) <= 4 ? PNG_LOW_MEMORY_MAX_PIXELS : PNG_SINGLE_MAX_PIXELS;
  return {
    width: w,
    height: h,
    pixels,
    estimatedRGBABytes: pixels * 4,
    single: mode !== 'tiles' && w <= PNG_SINGLE_MAX_SIDE && h <= PNG_SINGLE_MAX_SIDE && pixels <= budget,
  };
}

export interface PngTile {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  col: number;
  row: number;
}
export interface PngTilePlan {
  cols: number;
  rows: number;
  tiles: PngTile[];
  /** The README.txt lines placed first in the ZIP. */
  manifest: string[];
}
/** The tiling grid for a full image of `fullW × fullH` pixels at scale `s`, with file names and the README. */
export function pngTilePlan(fullW: number, fullH: number, s: number): PngTilePlan {
  const tile = PNG_TILE;
  const cols = Math.ceil(fullW / tile);
  const rows = Math.ceil(fullH / tile);
  if (cols * rows > PNG_MAX_TILES) throw new Error('PNG requires too many tiles; try SVG or PDF');
  const manifest = [
    'WITT high-resolution PNG tiles',
    '',
    `Complete image: ${fullW} x ${fullH} pixels`,
    `Scale: ${s}x`,
    `Grid: ${cols} columns x ${rows} rows`,
    '',
    'Images are tiled without overlap. X and Y coordinates are in the complete image.',
    '',
  ];
  const tiles: PngTile[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const x = col * tile;
      const y = row * tile;
      const w = Math.min(tile, fullW - x);
      const h = Math.min(tile, fullH - y);
      const name = `tile_r${String(row + 1).padStart(2, '0')}_c${String(col + 1).padStart(2, '0')}_x${x}_y${y}.png`;
      manifest.push(`${name}: ${w} x ${h} pixels, x=${x}, y=${y}`);
      tiles.push({ name, x, y, width: w, height: h, col, row });
    }
  return { cols, rows, tiles, manifest };
}
/** The ZIP entries for rendered tiles: README.txt first, then each tile's PNG bytes. */
export function pngTileEntries(plan: PngTilePlan, tileBytes: Uint8Array[]): ZipEntry[] {
  const entries: ZipEntry[] = plan.tiles.map((tile, i) => ({ name: tile.name, bytes: tileBytes[i]! }));
  entries.unshift({ name: 'README.txt', bytes: new TextEncoder().encode(plan.manifest.join('\n') + '\n') });
  return entries;
}

// Browser part.

/** One PNG of the whole SVG; throws when the plan is not single or the canvas cannot be allocated. */
export async function pngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const plan = pngPlan(width, height, scale);
  if (!plan.single) throw new Error('PNG dimensions exceed the single-image memory budget');
  const im = await imageFromSvg(svg);
  const canvas = canvasFor(plan.width, plan.height);
  try {
    if (canvas.width !== plan.width || canvas.height !== plan.height)
      throw new Error('Browser canvas size limit exceeded');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser PNG canvas unavailable');
    ctx.drawImage(im, 0, 0, plan.width, plan.height);
    return await blobFor(canvas, 'image/png');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
export interface PngExportResult {
  blob: Blob;
  tiled: boolean;
  tiles: number;
  /** Why a single PNG was abandoned for tiles, when it was tried. */
  fallbackReason?: string;
}
/** Try one PNG when the plan allows, otherwise (or on failure) render the tiles and bundle them as a ZIP. */
export async function pngExport(
  svg: string,
  width: number,
  height: number,
  scale = 2,
  mode: PngMode | string = 'auto',
  deviceMemory: number | undefined = typeof navigator === 'object'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    : undefined
): Promise<PngExportResult> {
  const s = clampScale(scale);
  const plan = pngPlan(width, height, s, mode, deviceMemory);
  let fallbackReason = '';
  if (plan.single) {
    try {
      return { blob: await pngBlob(svg, width, height, s), tiled: false, tiles: 1 };
    } catch (error) {
      fallbackReason = (error instanceof Error && error.message) || 'Browser cannot encode a single PNG';
    }
  }
  const tiling = pngTilePlan(plan.width, plan.height, s);
  const bytes: Uint8Array[] = [];
  for (const tile of tiling.tiles) {
    const fragment = tileSvg(svg, tile.x, tile.y, tile.width, tile.height, s);
    const im = await imageFromSvg(fragment);
    const canvas = canvasFor(tile.width, tile.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser PNG drawing unavailable');
    ctx.drawImage(im, 0, 0, tile.width, tile.height);
    bytes.push(new Uint8Array(await (await blobFor(canvas, 'image/png')).arrayBuffer()));
    canvas.width = 0;
    canvas.height = 0;
  }
  return {
    blob: zipStored(pngTileEntries(tiling, bytes)),
    tiled: true,
    tiles: tiling.cols * tiling.rows,
    fallbackReason,
  };
}
