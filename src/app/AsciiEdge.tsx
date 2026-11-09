// The ASCII theme (owner decision 2026-11-09, UI_INVENTORY S-15) draws each tree edge from characters instead of a
// curve: the same end points as `edgeGeometry`, routed as an elbow of `-` runs, `|` runs (a rotated `-` run), `+`
// corners and an arrow head pointing at the child.
import type { ReactNode } from 'react';

const CHAR_W = 7.8;

function run(key: string, x1: number, y1: number, x2: number, y2: number): ReactNode {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 4) return null;
  const count = Math.max(1, Math.round(length / CHAR_W));
  const vertical = x1 === x2;
  const sx = vertical ? x1 : Math.min(x1, x2);
  const sy = vertical ? Math.min(y1, y2) : y1;
  return (
    <text
      key={key}
      x={sx}
      y={sy + 4}
      textLength={length}
      lengthAdjust="spacingAndGlyphs"
      transform={vertical ? `rotate(90 ${sx} ${sy})` : undefined}
    >
      {'-'.repeat(count)}
    </text>
  );
}

function glyph(key: string, x: number, y: number, char: string): ReactNode {
  return (
    <text key={key} x={x} y={y + 4} textAnchor="middle" className="ascii-glyph">
      {char}
    </text>
  );
}

/** `d` is an `M sx sy C c1x c1y, c2x c2y, ex ey` path from `edgeGeometry`. */
export function asciiEdgeParts(d: string): ReactNode[] {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (n.length < 4) return [];
  const [sx, sy, c1x, c1y] = n as [number, number, number, number];
  const ex = n[n.length - 2] as number;
  const ey = n[n.length - 1] as number;
  const horizontal = Math.abs(c1x - sx) >= Math.abs(c1y - sy);
  if (horizontal) {
    const mx = Math.round((sx + ex) / 2);
    const head = ex >= mx ? '>' : '<';
    return [
      run('a', sx, sy, mx, sy),
      run('b', mx, sy, mx, ey),
      run('c', mx, ey, ex - (ex >= mx ? 5 : -5), ey),
      sy !== ey ? glyph('k1', mx, sy, '+') : null,
      sy !== ey ? glyph('k2', mx, ey, '+') : null,
      glyph('h', ex - (ex >= mx ? 3 : -3), ey, head),
    ];
  }
  const my = Math.round((sy + ey) / 2);
  const head = ey >= my ? 'v' : '^';
  return [
    run('a', sx, sy, sx, my),
    run('b', sx, my, ex, my),
    run('c', ex, my, ex, ey - (ey >= my ? 6 : -6)),
    sx !== ex ? glyph('k1', sx, my, '+') : null,
    sx !== ex ? glyph('k2', ex, my, '+') : null,
    glyph('h', ex, ey - (ey >= my ? 4 : -4), head),
  ];
}
