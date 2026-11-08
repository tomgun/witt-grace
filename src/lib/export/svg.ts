// The SVG drawing of a tree snapshot, string-identical to the prototype's `diagram-export.js renderSvg`. The export
// draws the tree itself from node positions and texts (never a screenshot of the viewport); PNG and PDF are derived
// from this same SVG. Pure: no DOM.
export const EXPORT_CARD_W = 252;
export const EXPORT_PADDING = 48;
export const EXPORT_HEADER = 90;
export const EXPORT_MAX_NODES = 2500;

export type ExportPalette = 'light' | 'dark';
export interface SnapshotNode {
  id: string;
  x: number;
  y: number;
  title: string;
  details: string;
  /** The displayed stance; colours the accent bar and type tag. */
  relation: string;
  shared: boolean;
  /** Localised type label; empty when labels are off (never an English enum fallback). */
  typeLabel: string;
  /** Footer chips in order, e.g. `netto: +12.0`, `arvio: 75%`. */
  chips: string[];
  important: boolean;
  dim: boolean;
}
export interface SnapshotEdge {
  d: string;
  relation: string;
  important?: boolean;
  /** Signed influence shown in personal mode; undefined in shared mode, null when unreviewed. */
  personalDirection?: number | null;
  unassessed?: boolean;
  secondary?: boolean;
  dim: boolean;
}
export interface ExportSnapshot {
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  layers: { details: boolean; ratings: boolean };
  highlight: boolean;
  palette: ExportPalette;
  title: string;
  subtitle: string;
  /** Word after the node count in the subtitle; the prototype never passes it, so "nodes" is drawn. */
  nodeWord?: string;
}
export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
}

interface Palette {
  bg: string;
  card: string;
  ink: string;
  muted: string;
  border: string;
  footer: string;
  support: string;
  oppose: string;
  option: string;
  neutral: string;
  important: string;
  accent: string;
}
export const EXPORT_COLORS: Record<ExportPalette, Palette> = {
  light: {
    bg: '#f8fafc',
    card: '#ffffff',
    ink: '#17223a',
    muted: '#66758d',
    border: '#d8e1ed',
    footer: '#f4f6fb',
    support: '#168b83',
    oppose: '#d36c43',
    option: '#6556bc',
    neutral: '#778398',
    important: '#f3b62d',
    accent: '#554bb1',
  },
  dark: {
    bg: '#111827',
    card: '#1e293b',
    ink: '#f1f5ff',
    muted: '#c1c8da',
    border: '#44516a',
    footer: '#172234',
    support: '#3bcabb',
    oppose: '#ffa27b',
    option: '#b9a7ff',
    neutral: '#b5c0ce',
    important: '#ffc857',
    accent: '#b7aaff',
  },
};

export const escapeXml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Greedy word wrap into at most `max` rows of `limit` characters; long words are cut with an ellipsis. */
export function wrapLines(value: unknown, limit = 34, max = 3): string[] {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  let row = '';
  for (let word of words) {
    while (word.length > limit) {
      if (row) {
        out.push(row);
        row = '';
      }
      out.push(word.slice(0, limit - 1) + '…');
      word = word.slice(limit - 1);
    }
    if (!row) row = word;
    else if ((row + ' ' + word).length <= limit) row += ' ' + word;
    else {
      out.push(row);
      row = word;
    }
  }
  if (row) out.push(row);
  if (out.length > max) {
    out.length = max;
    out[max - 1] = (out[max - 1] ?? '').slice(0, limit - 1).replace(/\s+$/, '') + '…';
  }
  return out;
}

const edgeColor = (relation: string, p: Palette): string =>
  (p as unknown as Record<string, string | undefined>)[relation] || p.neutral;
const nodeBadge = (node: SnapshotNode): string =>
  node.relation === 'group'
    ? '▣'
    : node.relation === 'option'
      ? '◆'
      : node.relation === 'support'
        ? '+'
        : node.relation === 'oppose'
          ? '−'
          : node.relation === 'neutral'
            ? '0'
            : '◇';

/** Card height in the export: taller when details or any rating chips are drawn. */
export const exportCardHeight = (layers: { details: boolean; ratings: boolean }): number =>
  layers.details || layers.ratings ? 176 : 148;

export interface SvgBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
  cardHeight: number;
  /** Translation that moves the tree into the padded, headed canvas. */
  ox: number;
  oy: number;
}
/** Canvas size for a node set: bounding box plus padding and the title header. Throws on empty, oversized or
 * raster-hostile trees, as the prototype. */
export function svgBounds(nodes: Pick<SnapshotNode, 'x' | 'y'>[], cardHeight: number): SvgBounds {
  if (!nodes.length) throw new Error('No tree nodes to export');
  if (nodes.length > EXPORT_MAX_NODES) throw new Error('Too many nodes for a visual export (2500 maximum)');
  const padding = EXPORT_PADDING;
  const header = EXPORT_HEADER;
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + EXPORT_CARD_W));
  const maxY = Math.max(...nodes.map((n) => n.y + cardHeight));
  const width = Math.ceil(maxX - minX + padding * 2);
  const height = Math.ceil(maxY - minY + padding * 2 + header);
  if (width > 40000 || height > 40000 || width * height > 220000000)
    throw new Error('Tree is too large for raster export. Reduce visible branches.');
  return { minX, minY, width, height, cardHeight, ox: padding - minX, oy: padding + header - minY };
}

/** The complete SVG document for a snapshot. */
export function renderSvg(snapshot: ExportSnapshot): RenderedSvg {
  const nodes = snapshot.nodes || [];
  const edges = snapshot.edges || [];
  const p = EXPORT_COLORS[snapshot.palette === 'dark' ? 'dark' : 'light'];
  const cardHeight = exportCardHeight(snapshot.layers ?? { details: false, ratings: false });
  const { width, height, ox, oy } = svgBounds(nodes, cardHeight);
  const padding = EXPORT_PADDING;
  const bits: string[] = [];
  bits.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(snapshot.title)}">`
  );
  bits.push(`<rect width="${width}" height="${height}" fill="${p.bg}"/>`);
  bits.push(
    `<defs><marker id="witt-sup" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 Z" fill="${p.support}"/></marker><marker id="witt-opp" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 Z" fill="${p.oppose}"/></marker></defs>`
  );
  bits.push(
    `<text x="${padding}" y="44" fill="${p.ink}" font-family="Arial, sans-serif" font-size="24" font-weight="700">${escapeXml(wrapLines(snapshot.title, 80, 1)[0])}</text>`
  );
  bits.push(
    `<text x="${padding}" y="66" fill="${p.muted}" font-family="Arial, sans-serif" font-size="12">${escapeXml(snapshot.subtitle || 'WITT · GRACE')} · ${nodes.length} ${escapeXml(snapshot.nodeWord || 'nodes')}</text>`
  );
  bits.push(`<g transform="translate(${ox} ${oy})">`);
  for (const edge of edges) {
    const color =
      edge.personalDirection === null && edge.unassessed
        ? p.neutral
        : typeof edge.personalDirection === 'number'
          ? edge.personalDirection > 0
            ? p.support
            : edge.personalDirection < 0
              ? p.oppose
              : p.neutral
          : edgeColor(edge.relation, p);
    const strong = !!(snapshot.highlight && edge.important);
    const opacity = edge.dim ? '.18' : edge.secondary ? '.55' : '.85';
    const dash = edge.secondary
      ? '7 6'
      : edge.personalDirection === 0 || edge.relation === 'neutral'
        ? '3 5'
        : edge.relation === 'oppose'
          ? '7 5'
          : '';
    if (strong)
      bits.push(
        `<path d="${escapeXml(edge.d)}" fill="none" stroke="${p.important}" stroke-width="10" opacity=".33" stroke-linecap="round"/>`
      );
    bits.push(
      `<path d="${escapeXml(edge.d)}" fill="none" stroke="${color}" stroke-width="${strong ? 4.5 : edge.secondary ? 2 : 2.7}" stroke-linecap="round" opacity="${opacity}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
    );
  }
  for (const n of nodes) {
    const x = n.x;
    const y = n.y;
    const relation = n.relation || 'neutral';
    const color = edgeColor(relation, p);
    const strong = !!(snapshot.highlight && n.important);
    const dim = n.dim ? '.35' : '1';
    bits.push(`<g opacity="${dim}">`);
    if (strong)
      bits.push(
        `<rect x="${x - 5}" y="${y - 5}" width="${EXPORT_CARD_W + 10}" height="${cardHeight + 10}" rx="15" fill="none" stroke="${p.important}" stroke-width="4"/>`
      );
    bits.push(
      `<rect x="${x}" y="${y}" width="${EXPORT_CARD_W}" height="${cardHeight}" rx="12" fill="${p.card}" stroke="${strong ? p.important : p.border}" stroke-width="${strong ? 2 : 1.3}"/>`
    );
    bits.push(
      `<path d="M${x + 12} ${y + 2} H${x + EXPORT_CARD_W - 12}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`
    );
    const titleLines = wrapLines(n.title, 36, 3);
    const tag = String(n.typeLabel || '');
    if (tag)
      bits.push(
        `<text x="${x + 12}" y="${y + 19}" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="${color}">${escapeXml(nodeBadge(n) + '  ' + tag)}</text>`
      );
    if (n.shared)
      bits.push(
        `<text x="${x + EXPORT_CARD_W - 10}" y="${y + 19}" text-anchor="end" font-family="Arial, sans-serif" font-size="9" fill="${p.muted}">↗</text>`
      );
    const titleY = y + 40;
    titleLines.forEach((l, i) =>
      bits.push(
        `<text x="${x + 12}" y="${titleY + i * 17}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${p.ink}">${escapeXml(l)}</text>`
      )
    );
    if (snapshot.layers?.details && n.details) {
      const detailY = Math.max(y + 101, titleY + titleLines.length * 17 + 4);
      bits.push(
        `<text x="${x + 12}" y="${detailY}" font-family="Arial, sans-serif" font-size="10" fill="${p.muted}">${escapeXml(wrapLines(n.details, 44, 1)[0])}</text>`
      );
    }
    if (snapshot.layers?.ratings && n.chips?.length) {
      bits.push(
        `<rect x="${x + 1}" y="${y + cardHeight - 46}" width="${EXPORT_CARD_W - 2}" height="45" rx="10" fill="${p.footer}"/>`
      );
      const tokens = n.chips.map((v) => String(v)).filter(Boolean);
      const rows: string[] = [];
      let line = '';
      for (const token of tokens) {
        if ((line + '  ' + token).length > 43) {
          if (line) rows.push(line);
          line = token;
        } else line += (line ? '  ·  ' : '') + token;
      }
      if (line) rows.push(line);
      rows
        .slice(0, 2)
        .forEach((l, i) =>
          bits.push(
            `<text x="${x + 12}" y="${y + cardHeight - 27 + i * 17}" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="${p.muted}">${escapeXml(l.slice(0, 48))}</text>`
          )
        );
    }
    bits.push('</g>');
  }
  bits.push('</g></svg>');
  return { svg: bits.join(''), width, height };
}

/** Rewrite the root element so a bounded window of the drawing renders at `pixelW × pixelH` (PNG tiles, PDF pages). */
export function tileSvg(
  svg: string,
  x: number,
  y: number,
  pixelW: number,
  pixelH: number,
  scale: number
): string {
  if (!svg.startsWith('<svg ')) throw new Error('Expected a WITT export SVG');
  const head = svg.indexOf('>');
  if (head < 0) throw new Error('Invalid SVG export');
  const root = svg
    .slice(0, head + 1)
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
    .replace(/\sviewBox="[^"]*"/, '');
  return (
    root.slice(0, -1) +
    ` width="${pixelW}" height="${pixelH}" viewBox="${x / scale} ${y / scale} ${pixelW / scale} ${pixelH / scale}">` +
    svg.slice(head + 1)
  );
}
/** Keep the full drawing but rasterise it at reduced pixel dimensions (the one-page PDF). */
export function sizeSvg(svg: string, pixelW: number, pixelH: number): string {
  if (!svg.startsWith('<svg ')) throw new Error('Expected a WITT export SVG');
  const end = svg.indexOf('>');
  if (end < 0) throw new Error('Invalid SVG export');
  const root = svg
    .slice(0, end + 1)
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '');
  return root.slice(0, -1) + ` width="${pixelW}" height="${pixelH}">` + svg.slice(end + 1);
}
