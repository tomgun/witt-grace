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

/** Morning mist behind every card (owner 2026-11-19: the haze behind the cards is what makes them sit in the
 * picture): a soft pale patch a little larger than the card, so the trunks and ferns fade where a card is read and
 * the cards of one branch are joined by the same light. World coordinates: it moves and scales with the tree. */
export function GroveMist({ cards }: { cards: readonly { x: number; y: number; w: number; h: number }[] }) {
  return (
    <g className="grove-mist" aria-hidden="true">
      <defs>
        <radialGradient id="groveMist">
          <stop offset="0" stopColor="#fbfcf2" stopOpacity="0.92" />
          <stop offset="0.55" stopColor="#fbfcf2" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fbfcf2" stopOpacity="0" />
        </radialGradient>
      </defs>
      {cards.map((c, i) => (
        <ellipse
          key={i}
          cx={c.x + c.w / 2}
          cy={c.y + c.h / 2}
          rx={c.w * 0.95}
          ry={c.h * 1.25}
          fill="url(#groveMist)"
        />
      ))}
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
      {/* A shadow side and an outline: a white trunk on a pale morning needs an edge to be a trunk at all. */}
      <rect x="5" y="0" width="50" height="1100" fill="#c2c8b2" />
      <rect x="6.5" y="0" width="47" height="1100" fill="#f6f4e8" />
      <rect x="40" y="0" width="13.5" height="1100" fill="#dcdccb" />
      <rect x="6.5" y="0" width="8" height="1100" fill="#fdfcf5" />
      {BIRCH_MARKS.map(([mx, my, w], i) => (
        <path
          key={i}
          d={`M${mx} ${my} q${w / 2} -5 ${w} 0 q${-w / 2} 5 ${-w} 0 Z`}
          fill="#6b6a5c"
          opacity={0.7}
        />
      ))}
    </svg>
  );
}

// The grove seen from inside it (owner 2026-11-19: small round trees at the foot made the falling leaves and the
// animals on the branches hang in an empty sky; the first redraw of this was a scatter of pale stripes, loose sprigs
// and patches). One picture in four planes, each a single tone that darkens toward the viewer, as mist does it:
// far trunks, nearer trunks, the ground, and the canopy closing the top. A birch stands at each side.
// Fixed shapes: the same grove every time.
const FAR_TRUNKS = [40, 118, 212, 300, 392, 470, 548, 640, 722, 810, 905, 990, 1075, 1160];
const MID_TRUNKS = [165, 436, 760, 1030];
const FERNS = [60, 250, 470, 640, 860, 1040, 1160];
const TUFTS = [20, 140, 330, 400, 560, 730, 790, 950, 1100];
const LIGHTS = [
  { x: 22, y: 26, s: 300, d: 0 },
  { x: 62, y: 34, s: 340, d: -6 },
];

/** The grove behind the tree: a canopy overhead, trunks from top to bottom, ferns and grass at the foot, light
 * falling between. It does not move with the canvas and nothing in it takes input. */
export function GroveScenery() {
  return (
    <div className="grove-scenery" aria-hidden="true" data-testid="grove-scenery">
      <svg className="grove-trunks" viewBox="0 0 1200 800" preserveAspectRatio="none">
        <g fill="#c3d0ae">
          {FAR_TRUNKS.map((x, i) => (
            <path
              key={`f${i}`}
              d={`M${x - 6 - (i % 3)} 800 L${x - 3} 0 L${x + 3 + (i % 2)} 0 L${x + 7 + (i % 3)} 800 Z`}
            />
          ))}
        </g>
        <g fill="#a7b592" stroke="#a7b592" strokeLinecap="round">
          {MID_TRUNKS.map((x, i) => (
            <g key={`m${i}`}>
              <path
                strokeWidth="0"
                d={`M${x - 15 - (i % 2) * 3} 800 C${x - 10} 520 ${x - 8} 260 ${x - 7} 0 L${x + 7} 0 C${x + 9} 260 ${x + 11} 520 ${x + 17 + (i % 2) * 3} 800 Z`}
              />
              <path
                fill="none"
                strokeWidth="6"
                d={`M${x - 4} 330 C${x - 44} 280 ${x - 78} 268 ${x - 104} 214 M${x + 4} 230 C${x + 40} 186 ${x + 70} 172 ${x + 96} 120`}
              />
            </g>
          ))}
        </g>
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
              height: l.s * 0.8,
              '--d': `${l.d}s`,
            } as CSSProperties
          }
        />
      ))}
      <svg className="grove-ground" viewBox="0 0 1200 150" preserveAspectRatio="xMidYMax slice">
        <path d="M0 62 C160 40 330 58 520 46 C740 32 930 60 1200 42 L1200 150 L0 150 Z" fill="#c6dcab" />
        <path d="M0 100 C220 80 420 100 640 88 C860 76 1040 100 1200 86 L1200 150 L0 150 Z" fill="#aed08d" />
        {FERNS.map((fx, i) => (
          <g key={`fern${i}`} stroke="#6fa955" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d={`M${fx} 118 q-26 -34 -52 -30 M${fx} 118 q-12 -44 -30 -52 M${fx} 118 q2 -50 -2 -62`} />
            <path d={`M${fx} 118 q14 -44 32 -50 M${fx} 118 q28 -32 54 -26`} />
          </g>
        ))}
        {TUFTS.map((tx, i) => (
          <path
            key={`t${i}`}
            d={`M${tx} 134 q-7 -18 -12 -22 M${tx} 134 q-1 -22 -2 -28 M${tx} 134 q6 -18 12 -22`}
            stroke="#7fb463"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </svg>
      <Birch className="left" />
      <Birch className="right" />
      {/* The canopy: three unbroken bands of foliage with scalloped lower edges, the lightest hanging lowest. */}
      <svg className="grove-canopy" viewBox="0 0 1200 260" preserveAspectRatio="none">
        <path
          fill="#b9dc92"
          opacity="0.8"
          d="M0 0 H1200 V150 C1150 196 1100 150 1050 176 C1000 214 950 160 900 184 C850 222 790 168 740 190 C690 226 640 170 590 186 C540 220 480 166 430 188 C380 224 330 172 280 190 C230 222 170 166 120 186 C80 210 40 176 0 190 Z"
        />
        <path
          fill="#93c56f"
          opacity="0.9"
          d="M0 0 H1200 V104 C1140 150 1090 108 1030 132 C970 168 920 118 860 136 C800 170 750 122 690 140 C630 172 580 120 520 138 C460 170 410 124 350 140 C290 172 240 118 180 136 C120 168 60 126 0 142 Z"
        />
        <path
          fill="#6fa955"
          d="M0 0 H1200 V58 C1130 100 1080 62 1010 84 C940 116 890 70 820 88 C750 118 700 72 630 90 C560 120 510 70 440 88 C370 118 320 74 250 90 C180 120 120 72 60 90 C40 98 20 86 0 92 Z"
        />
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
