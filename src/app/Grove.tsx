// The Lehto (grove) theme's artwork (owner request 2026-11-12, UI_INVENTORY S-15). All motion is CSS (keyframes and
// `offset-path`), so `prefers-reduced-motion`, the calm class and the phone rules live in `themes-added.css` and
// nothing here touches a timer or `matchMedia`. Every element is decoration: `aria-hidden`, no pointer events.
import type { CSSProperties, ReactNode } from 'react';
import { crownBlobs, type Creature, type CreatureKind } from './grove.ts';

/** The large crown behind the main claim: overlapping leaf clusters with a soft golden light under them. */
export function GroveCrown({ x, y, spread }: { x: number; y: number; spread: number }) {
  const blobs = crownBlobs(x, y, spread);
  return (
    <g className="grove-crown" aria-hidden="true">
      <defs>
        <radialGradient id="groveGlow">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={x} cy={y} rx={Math.max(560, spread) * 1.1} ry={300} fill="url(#groveGlow)" />
      {blobs.map((b, i) => (
        <circle key={i} className={`grove-leaves tone-${b.tone}`} cx={b.x} cy={b.y} r={b.r} />
      ))}
    </g>
  );
}

const ART: Record<CreatureKind, ReactNode> = {
  squirrel: (
    <>
      <path className="tail" d="M-6 -4 C-24 -8 -22 -30 -6 -28 C-12 -20 -4 -12 2 -8 Z" />
      <ellipse className="body" cx="2" cy="-6" rx="9" ry="6" />
      <circle className="body" cx="11" cy="-12" r="5" />
      <path className="body" d="M9 -16 L11 -22 L14 -16 Z" />
      <circle className="eye" cx="13" cy="-12.5" r="1" />
    </>
  ),
  owl: (
    <>
      <ellipse className="body" cx="0" cy="-12" rx="8" ry="11" />
      <path className="body" d="M-7 -20 L-5 -27 L-1 -21 Z M7 -20 L5 -27 L1 -21 Z" />
      <circle className="eyewhite" cx="-3.5" cy="-15" r="3.4" />
      <circle className="eyewhite" cx="3.5" cy="-15" r="3.4" />
      <circle className="eye" cx="-3.5" cy="-15" r="1.4" />
      <circle className="eye" cx="3.5" cy="-15" r="1.4" />
      <path className="beak" d="M-1.4 -12 L1.4 -12 L0 -9 Z" />
    </>
  ),
  butterfly: (
    <g className="flap">
      <ellipse className="wing a" cx="-6" cy="-9" rx="6" ry="8" />
      <ellipse className="wing a" cx="6" cy="-9" rx="6" ry="8" />
      <ellipse className="wing b" cx="-4" cy="-3" rx="4" ry="5" />
      <ellipse className="wing b" cx="4" cy="-3" rx="4" ry="5" />
      <rect className="body" x="-1" y="-14" width="2" height="14" rx="1" />
    </g>
  ),
  snail: (
    <>
      <path className="body" d="M-12 0 C-6 -4 6 -4 12 0 Z M10 -2 L13 -9 M13 -2 L17 -8" />
      <circle className="shell" cx="-2" cy="-8" r="8" />
      <path className="spiral" d="M-2 -8 m-4 0 a4 4 0 1 1 4 4 a2.4 2.4 0 1 1 -2 -2.4" />
    </>
  ),
};

/** Small animals that walk (or flutter) along the branch of `creature.id`; `edges` maps a child id to its path. */
export function GroveCreatures({
  creatures,
  edges,
}: {
  creatures: readonly Creature[];
  edges: ReadonlyMap<string, string>;
}) {
  return (
    <g className="grove-creatures" aria-hidden="true">
      {creatures.flatMap((c) => {
        const d = edges.get(c.id);
        if (!d) return [];
        const style = {
          offsetPath: `path("${d}")`,
          animationDuration: `${c.dur}s`,
          animationDelay: `${c.delay}s`,
        } as CSSProperties;
        return [
          <g key={c.id} className={`grove-creature grove-${c.kind}`} data-creature={c.kind} style={style}>
            <g transform="scale(1.6)">{ART[c.kind]}</g>
          </g>,
        ];
      })}
    </g>
  );
}

// Fixed, hand-placed values: a tree always shows the same weather.
const LEAVES = [
  { x: 6, d: 0, t: 34 },
  { x: 17, d: -9, t: 41 },
  { x: 29, d: -20, t: 37 },
  { x: 41, d: -5, t: 44 },
  { x: 54, d: -26, t: 39 },
  { x: 66, d: -13, t: 46 },
  { x: 78, d: -31, t: 36 },
  { x: 91, d: -18, t: 42 },
];
const BIRDS = [
  { y: 12, d: 0, t: 52, s: 1 },
  { y: 28, d: -21, t: 64, s: 0.75 },
  { y: 8, d: -38, t: 58, s: 0.6 },
];
const FIREFLIES = [
  { x: 12, y: 62, d: 0 },
  { x: 31, y: 78, d: -2 },
  { x: 48, y: 55, d: -4 },
  { x: 63, y: 82, d: -1 },
  { x: 77, y: 66, d: -3 },
  { x: 90, y: 74, d: -5 },
];

/** Drifting leaves, gliding birds and fireflies: a screen-space layer behind the cards. */
export function GroveAmbient() {
  return (
    <div className="grove-ambient" aria-hidden="true" data-testid="grove-ambient">
      {LEAVES.map((l, i) => (
        <i
          key={`l${i}`}
          className="grove-leaf"
          style={{ '--x': `${l.x}%`, '--d': `${l.d}s`, '--t': `${l.t}s` } as CSSProperties}
        />
      ))}
      {BIRDS.map((b, i) => (
        <svg
          key={`b${i}`}
          className="grove-bird"
          viewBox="-20 -12 40 20"
          style={{ '--y': `${b.y}%`, '--d': `${b.d}s`, '--t': `${b.t}s`, '--s': b.s } as CSSProperties}
        >
          <path className="wings" d="M-18 -2 Q-9 -12 0 0 Q9 -12 18 -2 Q9 -5 0 3 Q-9 -5 -18 -2 Z" />
        </svg>
      ))}
      {FIREFLIES.map((f, i) => (
        <b
          key={`f${i}`}
          className="grove-firefly"
          style={{ '--x': `${f.x}%`, '--y': `${f.y}%`, '--d': `${f.d}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}
