// PDF export: A4 pages rasterised from bounded SVG windows (JPEG, DCTDecode) with a page footer, written by a
// minimal PDF-1.4 writer. Orientation, the page grid, the fit scaling and the PDF bytes are pure and pinned against
// the prototype; only the canvas work needs a browser.
import { canvasFor, imageFromSvg, jpegBytes } from './raster.ts';
import { sizeSvg, tileSvg } from './svg.ts';

export type PdfLayout = 'pages-auto' | 'pages-portrait' | 'pages-landscape' | 'fit';
export const PDF_LAYOUTS: PdfLayout[] = ['pages-auto', 'pages-portrait', 'pages-landscape', 'fit'];
export type PdfOrientation = 'portrait' | 'landscape';
export const PDF_MAX_PAGES = 150;
export const PDF_PAGE_OVERLAP = 36;

export interface PdfPage {
  width: number;
  height: number;
  pixelsX: number;
  pixelsY: number;
  jpeg: Uint8Array;
}
export interface PdfTile {
  x: number;
  y: number;
  width: number;
  height: number;
  col: number;
  row: number;
}

/** Portrait when the drawing is clearly taller than wide, unless the layout fixes it. */
export const pdfOrientation = (
  width: number,
  height: number,
  layout: PdfLayout | string = 'pages-auto'
): PdfOrientation =>
  layout === 'pages-portrait'
    ? 'portrait'
    : layout === 'pages-landscape'
      ? 'landscape'
      : height > width * 1.15
        ? 'portrait'
        : 'landscape';

/** Page raster size in pixels at scale 1: 1020×1450 portrait, 1280×880 landscape. */
export const pdfPageRaster = (orientation: PdfOrientation): { pageW: number; pageH: number } =>
  orientation === 'portrait' ? { pageW: 1020, pageH: 1450 } : { pageW: 1280, pageH: 880 };

/** The page windows over a `width × height` drawing: overlapping by 36 px, at most 150 pages. */
export function pdfTilePlan(
  width: number,
  height: number,
  orientation: PdfOrientation = 'landscape'
): PdfTile[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('Invalid PDF export dimensions');
  const { pageW, pageH } = pdfPageRaster(orientation);
  const overlap = PDF_PAGE_OVERLAP;
  const stepW = pageW - overlap;
  const stepH = pageH - overlap;
  const cols = Math.max(1, Math.ceil((width - overlap) / stepW));
  const rows = Math.max(1, Math.ceil((height - overlap) / stepH));
  if (cols * rows > PDF_MAX_PAGES)
    throw new Error('PDF would exceed 150 pages; reduce visible branches or use SVG');
  const tiles: PdfTile[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const x = col * stepW;
      const y = row * stepH;
      tiles.push({ x, y, width: Math.min(pageW, width - x), height: Math.min(pageH, height - y), col, row });
    }
  return tiles;
}
/** The raster size for the one-page layout: at most 18 MP and 16000 px a side, never upscaled. */
export function pdfFitRasterSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('Invalid PDF export dimensions');
  const s = Math.min(1, Math.sqrt(18000000 / (width * height)), 16000 / width, 16000 / height);
  return { width: Math.max(1, Math.floor(width * s)), height: Math.max(1, Math.floor(height * s)) };
}

const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);
function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const p of parts) total += p.length;
  const buf = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    buf.set(p, at);
    at += p.length;
  }
  return buf;
}
/** The PDF file: one A4 page per image, centred with 25 pt padding, "Page i/N" footer in Helvetica 8 pt. */
export function pdfBytes(
  pages: PdfPage[],
  orientation: PdfOrientation = 'landscape'
): Uint8Array<ArrayBuffer> {
  if (!pages.length) throw new Error('PDF needs pages');
  const W = orientation === 'portrait' ? 595.276 : 841.89;
  const H = orientation === 'portrait' ? 841.89 : 595.276;
  const fontObj = 3 + pages.length * 3;
  const objects = new Map<number, Uint8Array>();
  objects.set(1, ascii('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(
    2,
    ascii(
      `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`
    )
  );
  pages.forEach((p, i) => {
    const base = 3 + 3 * i;
    const pad = 25;
    const availW = W - pad * 2;
    const availH = H - pad * 2;
    const scale = Math.min(availW / p.width, availH / p.height);
    const iw = p.width * scale;
    const ih = p.height * scale;
    const left = (W - iw) / 2;
    const bottom = (H - ih) / 2;
    objects.set(
      base,
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im  ${base + 2} 0 R >> /Font << /F1 ${fontObj} 0 R >> >> /Contents ${base + 1} 0 R >>`
      )
    );
    const stream = ascii(
      `q ${iw.toFixed(3)} 0 0 ${ih.toFixed(3)} ${left.toFixed(3)} ${bottom.toFixed(3)} cm /Im Do Q\nBT /F1 8 Tf ${W - 72} 14 Td (Page ${i + 1}/${pages.length}) Tj ET\n`
    );
    objects.set(
      base + 1,
      concat([ascii(`<< /Length ${stream.length} >>\nstream\n`), stream, ascii('endstream')])
    );
    objects.set(
      base + 2,
      concat([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${p.pixelsX} /Height ${p.pixelsY} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`
        ),
        p.jpeg,
        ascii('\nendstream'),
      ])
    );
  });
  objects.set(fontObj, ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  const chunks: Uint8Array[] = [ascii('%PDF-1.4\n%WITT\n')];
  const offsets: number[] = [0];
  let length = chunks[0]!.length;
  for (let i = 1; i <= fontObj; i++) {
    offsets[i] = length;
    const value = concat([ascii(`${i} 0 obj\n`), objects.get(i)!, ascii('\nendobj\n')]);
    chunks.push(value);
    length += value.length;
  }
  const xref = length;
  let xrefBody = `xref\n0 ${fontObj + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= fontObj; i++) xrefBody += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  chunks.push(
    ascii(xrefBody + `trailer\n<< /Size ${fontObj + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  );
  return concat(chunks);
}

// Browser part.

/** Render the PDF pages from the SVG: one reduced page for `fit`, else the A4 grid at scale 1. */
export async function pdfBlob(
  svg: string,
  width: number,
  height: number,
  layout: PdfLayout | string = 'pages-auto'
): Promise<Blob> {
  const orientation = pdfOrientation(width, height, layout);
  const pages: PdfPage[] = [];
  const rasterise = async (fragment: string, w: number, h: number) => {
    const im = await imageFromSvg(fragment);
    const c = canvasFor(w, h);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Browser PDF drawing unavailable');
    ctx.drawImage(im, 0, 0, w, h);
    pages.push({ width: w, height: h, pixelsX: w, pixelsY: h, jpeg: jpegBytes(c) });
    c.width = 0;
    c.height = 0;
  };
  if (layout === 'fit') {
    const { width: w, height: h } = pdfFitRasterSize(width, height);
    await rasterise(sizeSvg(svg, w, h), w, h);
  } else {
    for (const tile of pdfTilePlan(width, height, orientation))
      await rasterise(tileSvg(svg, tile.x, tile.y, tile.width, tile.height, 1), tile.width, tile.height);
  }
  return new Blob([pdfBytes(pages, orientation)], { type: 'application/pdf' });
}
