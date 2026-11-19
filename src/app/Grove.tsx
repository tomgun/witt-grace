// The Lehto (grove) theme's artwork (owner request 2026-11-12; redrawn 2026-11-19 as a morning in a birch grove,
// UI_INVENTORY S-15). All motion is CSS (keyframes and
// `offset-path`), so `prefers-reduced-motion`, the calm class and the phone rules live in `themes-added.css` and
// nothing here touches a timer or `matchMedia`. Every element is decoration: `aria-hidden`, no pointer events.
import type { CSSProperties, ReactNode } from 'react';
import { crownBlobs, type Creature, type CreatureKind } from './grove.ts';

/** One wash of leaf green: opaque in the middle, gone at the rim, so overlapping clusters read as foliage. */
const WASHES = [
  { id: 'groveLeaf0', color: '#5e9d4a' },
  { id: 'groveLeaf1', color: '#86bd62' },
  { id: 'groveLeaf2', color: '#b4d98a' },
];

/** The large crown behind the main claim: overlapping soft-edged leaf clusters with sunlight over them. */
export function GroveCrown({ x, y, spread }: { x: number; y: number; spread: number }) {
  const blobs = crownBlobs(x, y, spread);
  return (
    <g className="grove-crown" aria-hidden="true">
      <defs>
        <radialGradient id="groveGlow">
          <stop offset="0" stopColor="#fff6c9" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff6c9" stopOpacity="0" />
        </radialGradient>
        {WASHES.map((wash) => (
          <radialGradient key={wash.id} id={wash.id}>
            <stop offset="0" stopColor={wash.color} stopOpacity="0.62" />
            <stop offset="0.62" stopColor={wash.color} stopOpacity="0.42" />
            <stop offset="1" stopColor={wash.color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {blobs.map((b, i) => (
        <circle key={i} className={`grove-leaves tone-${b.tone}`} cx={b.x} cy={b.y} r={b.r} />
      ))}
      <ellipse cx={x} cy={y - 40} rx={Math.max(560, spread) * 0.9} ry={240} fill="url(#groveGlow)" />
    </g>
  );
}

// A birch: a pale trunk with the dark lens-shaped marks of its bark and two thin branches. Drawn tall and cropped
// from the top, so the foot of the trunk always stands on the tree line.
const BIRCH_MARKS = [
  [10, 40, 16],
  [34, 96, 12],
  [8, 170, 20],
  [30, 240, 14],
  [14, 318, 18],
  [36, 392, 10],
  [6, 470, 22],
  [28, 548, 15],
  [12, 630, 17],
  [34, 708, 12],
  [9, 790, 19],
  [26, 866, 13],
  [15, 948, 16],
  [35, 1030, 11],
] as const;
function Birch({ className }: { className: string }) {
  return (
    <svg className={`grove-birch ${className}`} viewBox="0 0 60 1100" preserveAspectRatio="xMidYMax slice">
      <path
        d="M30 420 C10 380 -6 372 -20 350 M30 660 C52 620 68 612 82 590"
        stroke="#b9b6a4"
        strokeWidth="4"
        fill="none"
      />
      <rect x="6" y="0" width="48" height="1100" fill="#faf8ee" />
      <rect x="6" y="0" width="9" height="1100" fill="#ffffff" opacity="0.8" />
      <rect x="44" y="0" width="10" height="1100" fill="#e3e0d0" />
      {BIRCH_MARKS.map(([mx, my, w], i) => (
        <path
          key={i}
          d={`M${mx} ${my} q${w / 2} -5 ${w} 0 q${-w / 2} 5 ${-w} 0 Z`}
          fill="#4b4a41"
          opacity={0.75}
        />
      ))}
    </svg>
  );
}

// The tree line: far hills, two rows of rounded crowns, ferns and grass at the foot. Fixed shapes: the same grove
// every time.
const FAR_CROWNS = [40, 150, 250, 370, 470, 590, 700, 810, 930, 1040, 1150];
const NEAR_CROWNS = [-10, 110, 215, 330, 455, 560, 680, 790, 905, 1010, 1120, 1210];
const TUFTS = [30, 120, 205, 300, 410, 520, 640, 735, 850, 960, 1075, 1170];
const LIGHTS = [
  { x: 18, y: 30, s: 220, d: 0 },
  { x: 46, y: 58, s: 170, d: -4 },
  { x: 68, y: 24, s: 260, d: -7 },
  { x: 84, y: 62, s: 150, d: -2 },
];

/** The grove behind the tree: light through the leaves, birches at the sides, a tree line at the foot. It does not
 * move with the canvas and nothing in it takes input. */
export function GroveScenery() {
  return (
    <div className="grove-scenery" aria-hidden="true" data-testid="grove-scenery">
      {LIGHTS.map((l, i) => (
        <i
          key={i}
          className="grove-light"
          style={
            {
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: l.s,
              height: l.s * 0.7,
              '--d': `${l.d}s`,
            } as CSSProperties
          }
        />
      ))}
      <svg className="grove-treeline" viewBox="0 0 1200 380" preserveAspectRatio="xMidYMax slice">
        <path
          d="M0 210 C150 150 300 190 450 165 C620 135 760 200 930 160 C1040 135 1130 170 1200 150 L1200 380 L0 380 Z"
          fill="#d3e6bc"
          opacity="0.75"
        />
        {FAR_CROWNS.map((cx, i) => {
          const top = 198 - (i % 3) * 14;
          return (
            <g key={`f${i}`} opacity="0.55">
              <ellipse cx={cx - 22} cy={top + 16} rx={34 + (i % 3) * 6} ry={40} fill="#c4deaa" />
              <ellipse cx={cx + 20} cy={top + 10} rx={38} ry={44 + (i % 4) * 5} fill="#bcd9a0" />
              <ellipse cx={cx} cy={top - 14} rx={40 + (i % 4) * 6} ry={42} fill="#cbe3b2" />
            </g>
          );
        })}
        <path
          d="M0 290 C200 262 380 286 600 270 C820 254 1000 284 1200 266 L1200 380 L0 380 Z"
          fill="#c3dea6"
        />
        {NEAR_CROWNS.map((cx, i) => {
          const top = 246 - (i % 4) * 11;
          const lean = (i % 3) - 1;
          return (
            <g key={`n${i}`}>
              <path
                d={`M${cx} 344 C${cx + lean * 4} 310 ${cx - lean * 5} 286 ${cx + lean * 3} ${top + 20}`}
                stroke="#8a8f6c"
                strokeWidth={5 + (i % 2) * 2}
                strokeLinecap="round"
                fill="none"
              />
              <ellipse
                cx={cx - 26}
                cy={top + 14}
                rx={30 + (i % 3) * 5}
                ry={32}
                fill="#93c173"
                opacity="0.9"
              />
              <ellipse cx={cx + 24} cy={top + 8} rx={34} ry={36 + (i % 4) * 4} fill="#a3cb82" opacity="0.9" />
              <ellipse
                cx={cx + lean * 6}
                cy={top - 16}
                rx={38 + (i % 4) * 5}
                ry={36}
                fill="#aed38c"
                opacity="0.92"
              />
              <ellipse cx={cx - 10} cy={top - 22} rx={18} ry={14} fill="#c6e2a6" opacity="0.8" />
            </g>
          );
        })}
        <path
          d="M0 338 C180 322 420 340 640 328 C860 316 1040 338 1200 326 L1200 380 L0 380 Z"
          fill="#a9cf88"
        />
        {TUFTS.map((tx, i) => (
          <path
            key={`t${i}`}
            d={`M${tx} 352 q-9 -22 -16 -26 M${tx} 352 q-2 -26 -3 -34 M${tx} 352 q7 -22 15 -27 M${tx} 352 q14 -12 24 -12`}
            stroke={i % 3 === 0 ? '#5f9a48' : '#79b05c'}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </svg>
      <Birch className="left" />
      <Birch className="left far" />
      <Birch className="right" />
      <Birch className="right far" />
    </div>
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
const MOTES = [
  { x: 12, y: 62, d: 0 },
  { x: 31, y: 78, d: -2 },
  { x: 48, y: 55, d: -4 },
  { x: 63, y: 82, d: -1 },
  { x: 77, y: 66, d: -3 },
  { x: 90, y: 74, d: -5 },
];

/** Drifting leaves, passing birds and pollen in the light: a screen-space layer behind the cards. */
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
      {MOTES.map((f, i) => (
        <b
          key={`f${i}`}
          className="grove-mote"
          style={{ '--x': `${f.x}%`, '--y': `${f.y}%`, '--d': `${f.d}s` } as CSSProperties}
        />
      ))}
    </div>
  );
}
