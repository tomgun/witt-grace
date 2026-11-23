// The home screen's backdrop (owner 2026-11-23), the himmeli: an argument tree drawn as a wire mesh that hangs
// from its main claim and turns slowly, and gives like a real mobile when a point of it is taken hold of. Pure:
// a small tree laid out in space from a seed, its points as masses joined by rods, and the projection of a point
// onto the screen and back. The canvas that draws it is HomeBackdrop.tsx.

export type MeshStance = 'root' | 'support' | 'oppose';
export interface MeshNode {
  x: number;
  y: number;
  z: number;
  stance: MeshStance;
  /** Index of the parent node; -1 for the main claim. */
  parent: number;
  depth: number;
}
/** A tree and nothing else (owner 2026-11-24): every point but the main claim has one line, to its own claim.
 * There are no lines between siblings, which would make it read as a net and not as an argument tree. */
export interface Mesh {
  nodes: MeshNode[];
}

/** mulberry32: a small seeded generator, so the backdrop is the same tree on every visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Children per level under the main claim, and how far each level spreads and drops (model units, the tree
 * fits a box of about ±1). */
const LEVELS = [
  { children: 5, radius: 0.62, drop: 0.5 },
  { children: 3, radius: 0.3, drop: 0.42 },
  { children: 2, radius: 0.16, drop: 0.34 },
] as const;

/** An argument tree in space: the main claim on top, its reasons in a ring below it, theirs below them. About
 * two reasons in three support, the rest oppose, as the seed decides. */
export function buildMesh(seed = 7): Mesh {
  const random = seeded(seed);
  const nodes: MeshNode[] = [{ x: 0, y: -0.78, z: 0, stance: 'root', parent: -1, depth: 0 }];
  const grow = (parent: number, depth: number) => {
    const level = LEVELS[depth];
    if (!level) return;
    const from = nodes[parent] as MeshNode;
    const turn = random() * Math.PI * 2;
    const first = nodes.length;
    for (let i = 0; i < level.children; i++) {
      const angle = turn + (i / level.children) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const reach = level.radius * (0.8 + random() * 0.4);
      nodes.push({
        x: from.x + Math.cos(angle) * reach,
        y: from.y + level.drop * (0.85 + random() * 0.3),
        z: from.z + Math.sin(angle) * reach,
        stance: random() < 0.66 ? 'support' : 'oppose',
        parent,
        depth: depth + 1,
      });
    }
    for (let i = 0; i < level.children; i++) grow(first + i, depth + 1);
  };
  grow(0, 0);
  return { nodes };
}

export interface Projected {
  x: number;
  y: number;
  /** Size factor from perspective: nearer is larger. */
  scale: number;
  /** 0 (far) … 1 (near), for fading what is behind. */
  near: number;
  /** Distance behind the screen plane in model units, for taking a pointer back into the model. */
  z: number;
}

const TILT = 0.32;
const CAMERA = 3.2;

/** A point of the model turned by `angle` about the vertical axis, tilted a little towards the viewer and
 * projected with perspective onto a screen box centred at (`cx`, `cy`) where one model unit is `unit` pixels. */
export function project(
  point: { x: number; y: number; z: number },
  angle: number,
  cx: number,
  cy: number,
  unit: number
): Projected {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x * cos - point.z * sin;
  const z0 = point.x * sin + point.z * cos;
  const y = point.y * Math.cos(TILT) - z0 * Math.sin(TILT);
  const z = point.y * Math.sin(TILT) + z0 * Math.cos(TILT);
  const scale = CAMERA / (CAMERA + z);
  return {
    x: cx + x * unit * scale,
    y: cy + y * unit * scale,
    scale,
    near: Math.max(0, Math.min(1, (1 - z) / 2)),
    z,
  };
}

/** The model point that `project` puts at screen (`sx`, `sy`) when it lies `z` behind the screen plane: where a
 * held point goes when the pointer moves, keeping its depth. */
export function unproject(
  sx: number,
  sy: number,
  z: number,
  angle: number,
  cx: number,
  cy: number,
  unit: number
): { x: number; y: number; z: number } {
  const scale = CAMERA / (CAMERA + z);
  const x = (sx - cx) / (unit * scale);
  const y = (sy - cy) / (unit * scale);
  const py = y * Math.cos(TILT) + z * Math.sin(TILT);
  const z0 = -y * Math.sin(TILT) + z * Math.cos(TILT);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos + z0 * sin, y: py, z: -x * sin + z0 * cos };
}

/** The index of the point nearest to (`x`, `y`) within `reach` pixels, or -1. */
export function nearestPoint(points: readonly Projected[], x: number, y: number, reach: number): number {
  let best = -1;
  let bestDistance = reach;
  points.forEach((p, i) => {
    const distance = Math.hypot(p.x - x, p.y - y);
    if (distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

// ---- The himmeli as a body (owner 2026-11-23: “ikään kuin fysiikkamallinnettuna… ettei koko rakennelma liiku
// vaan dynaamisesti noodin viereisistä”) -------------------------------------------------------------------------
// Every point is a small mass. A branch is a rod between a reason and its claim; each point is also drawn
// gently back to its own place, so the shape returns. The main claim is
// fixed: the tree hangs from it. A held point goes where the hand takes it and pulls its neighbours through the
// rods; let go, the pull runs out through the tree and dies away. Verlet integration: a point's speed is the
// difference between where it is and where it was.

export interface Body {
  /** x, y, z of every point, in the order of the mesh's nodes. */
  now: number[];
  before: number[];
}
export interface Hold {
  index: number;
  x: number;
  y: number;
  z: number;
}

export const bodyAtRest = (mesh: Mesh): Body => {
  const now = mesh.nodes.flatMap((n) => [n.x, n.y, n.z]);
  return { now, before: [...now] };
};

/** One step of simulated time is 16 ms; a frame takes as many as fit, four at most. */
export const BODY_STEP_MS = 16;
const KEEP = 0.94; // of a point's speed, per step
const HOME = 0.012; // of the way back to its own place, per step
const ROD = 0.5; // how much of a branch's stretch is taken up per pass
const PASSES = 3;
/** A held point is never taken farther than this from its own place (model units). */
export const HOLD_REACH = 1.1;

/** The body `ms` later. `hold` is the point a hand has, and where the hand is. */
export function bodyStep(mesh: Mesh, body: Body, ms: number, hold: Hold | null = null): Body {
  const steps = Math.max(1, Math.min(4, Math.round(ms / BODY_STEP_MS)));
  let now = body.now;
  let before = body.before;
  const length = (a: number, b: number): number => {
    const p = mesh.nodes[a] as MeshNode;
    const q = mesh.nodes[b] as MeshNode;
    return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  };
  const pin = (next: number[]) => {
    const root = mesh.nodes[0] as MeshNode;
    next[0] = root.x;
    next[1] = root.y;
    next[2] = root.z;
    if (!hold) return;
    const home = mesh.nodes[hold.index];
    if (!home || hold.index === 0) return;
    // The hand can take a point only so far from its place.
    const dx = hold.x - home.x;
    const dy = hold.y - home.y;
    const dz = hold.z - home.z;
    const far = Math.hypot(dx, dy, dz);
    const k = far > HOLD_REACH ? HOLD_REACH / far : 1;
    next[hold.index * 3] = home.x + dx * k;
    next[hold.index * 3 + 1] = home.y + dy * k;
    next[hold.index * 3 + 2] = home.z + dz * k;
  };
  const fixed = (i: number): boolean => i === 0 || i === hold?.index;
  const rod = (next: number[], a: number, b: number, give: number) => {
    const ax = a * 3;
    const bx = b * 3;
    const dx = (next[bx] as number) - (next[ax] as number);
    const dy = (next[bx + 1] as number) - (next[ax + 1] as number);
    const dz = (next[bx + 2] as number) - (next[ax + 2] as number);
    const distance = Math.hypot(dx, dy, dz) || 1e-9;
    const off = ((distance - length(a, b)) / distance) * give;
    // A fixed end does not move: the free end takes the whole correction.
    const shareA = fixed(a) ? 0 : fixed(b) ? 1 : 0.5;
    const shareB = fixed(b) ? 0 : fixed(a) ? 1 : 0.5;
    next[ax] = (next[ax] as number) + dx * off * shareA;
    next[ax + 1] = (next[ax + 1] as number) + dy * off * shareA;
    next[ax + 2] = (next[ax + 2] as number) + dz * off * shareA;
    next[bx] = (next[bx] as number) - dx * off * shareB;
    next[bx + 1] = (next[bx + 1] as number) - dy * off * shareB;
    next[bx + 2] = (next[bx + 2] as number) - dz * off * shareB;
  };
  for (let step = 0; step < steps; step++) {
    const next = now.map((value, i) => {
      const node = mesh.nodes[Math.floor(i / 3)] as MeshNode;
      const home = i % 3 === 0 ? node.x : i % 3 === 1 ? node.y : node.z;
      return value + (value - (before[i] as number)) * KEEP + (home - value) * HOME;
    });
    pin(next);
    for (let pass = 0; pass < PASSES; pass++) {
      mesh.nodes.forEach((node, i) => {
        if (node.parent >= 0) rod(next, node.parent, i, ROD);
      });
      pin(next);
    }
    before = now;
    now = next;
  }
  return { now, before };
}

/** How far the body is from rest: the largest distance of a point from its own place (model units). */
export function bodyUnrest(mesh: Mesh, body: Body): number {
  let most = 0;
  mesh.nodes.forEach((node, i) => {
    most = Math.max(
      most,
      Math.hypot(
        (body.now[i * 3] as number) - node.x,
        (body.now[i * 3 + 1] as number) - node.y,
        (body.now[i * 3 + 2] as number) - node.z
      )
    );
  });
  return most;
}
