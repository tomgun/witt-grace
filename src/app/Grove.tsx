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

// The grove seen from inside it (owner 2026-11-19: small round trees at the foot made the falling leaves and the
// animals on the branches hang in an empty sky). Tall trunks stand from the ground to a canopy that closes the top
// of the view; the leaves fall from that canopy and the branches of the argument tree run among the trunks.
// Fixed shapes: the same grove every time.
const FAR_TRUNKS = [70, 190, 285, 400, 505, 610, 735, 840, 950, 1045, 1140];
const MID_TRUNKS = [130, 345, 560, 690, 895, 1090];
const CANOPY = [
  [-20, 10, 150, 1],
  [110, -30, 170, 0],
  [240, 30, 140, 2],
  [360, -20, 180, 1],
  [500, 20, 150, 0],
  [620, -40, 190, 2],
  [760, 25, 150, 1],
  [880, -25, 175, 0],
  [1010, 30, 145, 2],
  [1130, -20, 170, 1],
  [1230, 20, 150, 0],
  [60, 95, 110, 2],
  [300, 110, 120, 0],
  [560, 100, 105, 1],
  [800, 115, 120, 2],
  [1060, 100, 110, 0],
] as const;
const CANOPY_TONES = ['#5e9d4a', '#86bd62', '#b4d98a'];
const SPRIGS = [150, 430, 700, 980];
const FERNS = [60, 250, 470, 640, 860, 1040, 1160];
const TUFTS = [20, 140, 330, 400, 560, 730, 790, 950, 1100];
const LIGHTS = [
  { x: 18, y: 34, s: 220, d: 0 },
  { x: 46, y: 60, s: 170, d: -4 },
  { x: 68, y: 30, s: 260, d: -7 },
  { x: 84, y: 64, s: 150, d: -2 },
];

/** The grove behind the tree: a canopy overhead, trunks from top to bottom, ferns and grass at the foot, light
 * falling between. It does not move with the canvas and nothing in it takes input. */
export function GroveScenery() {
  return (
    <div className="grove-scenery" aria-hidden="true" data-testid="grove-scenery">
      <svg className="grove-trunks" viewBox="0 0 1200 800" preserveAspectRatio="none">
        {FAR_TRUNKS.map((x, i) => (
          <path
            key={`f${i}`}
            d={`M${x - 5 - (i % 3)} 800 L${x - 3} 0 L${x + 3 + (i % 2)} 0 L${x + 6 + (i % 3)} 800 Z`}
            fill={i % 4 === 0 ? '#eef0e2' : '#c9d3b6'}
            opacity="0.55"
          />
        ))}
        {MID_TRUNKS.map((x, i) => (
          <g key={`m${i}`} opacity="0.6">
            <path
              d={`M${x - 13 - (i % 2) * 3} 800 C${x - 9} 520 ${x - 7} 260 ${x - 6} 0 L${x + 6} 0 C${x + 8} 260 ${x + 10} 520 ${x + 15 + (i % 2) * 3} 800 Z`}
              fill="#a9ae8f"
            />
            <path
              d={`M${x - 3} 300 C${x - 40} 250 ${x - 70} 240 ${x - 96} 200 M${x + 3} 190 C${x + 36} 150 ${x + 64} 140 ${x + 90} 104`}
              stroke="#a9ae8f"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        ))}
      </svg>
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
      <svg className="grove-ground" viewBox="0 0 1200 150" preserveAspectRatio="xMidYMax slice">
        <path
          d="M0 70 C160 46 330 64 520 52 C740 38 930 66 1200 48 L1200 150 L0 150 Z"
          fill="#cfe3b6"
          opacity="0.9"
        />
        <path d="M0 104 C220 84 420 104 640 92 C860 80 1040 104 1200 90 L1200 150 L0 150 Z" fill="#b5d595" />
        {FERNS.map((fx, i) => (
          <g
            key={`fern${i}`}
            stroke={i % 2 ? '#5f9a48' : '#6fa955'}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          >
            <path d={`M${fx} 118 q-26 -34 -52 -30 M${fx} 118 q-12 -44 -30 -52 M${fx} 118 q2 -50 -2 -62`} />
            <path d={`M${fx} 118 q14 -44 32 -50 M${fx} 118 q28 -32 54 -26`} />
          </g>
        ))}
        {TUFTS.map((tx, i) => (
          <path
            key={`t${i}`}
            d={`M${tx} 134 q-7 -18 -12 -22 M${tx} 134 q-1 -22 -2 -28 M${tx} 134 q6 -18 12 -22`}
            stroke={i % 3 === 0 ? '#4f8a3c' : '#79b05c'}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </svg>
      <Birch className="left" />
      <Birch className="left far" />
      <Birch className="right" />
      <Birch className="right far" />
      <svg className="grove-canopy" viewBox="0 0 1200 260" preserveAspectRatio="xMidYMin slice">
        <defs>
          {CANOPY_TONES.map((color, i) => (
            <radialGradient key={i} id={`groveCanopy${i}`}>
              <stop offset="0" stopColor={color} stopOpacity="0.95" />
              <stop offset="0.7" stopColor={color} stopOpacity="0.8" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {CANOPY.map(([cx, cy, r, tone], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={r} ry={r * 0.72} fill={`url(#groveCanopy${tone})`} />
        ))}
        {SPRIGS.map((sx, i) => (
          <g key={`s${i}`} opacity="0.9">
            <path
              d={`M${sx} ${96 + (i % 2) * 14} q${14 - i * 6} 44 ${-10 + i * 5} ${86 + (i % 2) * 18}`}
              stroke="#7a8f58"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            {[0, 1, 2, 3].map((k) => (
              <ellipse
                key={k}
                cx={sx + (k % 2 ? 12 : -10) + (i % 2) * 4}
                cy={118 + k * 20 + (i % 2) * 14}
                rx="11"
                ry="5.5"
                transform={`rotate(${k % 2 ? 28 : -32} ${sx + (k % 2 ? 12 : -10) + (i % 2) * 4} ${118 + k * 20 + (i % 2) * 14})`}
                fill={k % 2 ? '#86bd62' : '#6aa953'}
              />
            ))}
          </g>
        ))}
      </svg>
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
