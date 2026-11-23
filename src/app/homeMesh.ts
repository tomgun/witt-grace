// The home screen's backdrop (owner 2026-11-23): an argument tree drawn as a slowly turning wire mesh. Pure
// geometry: a small tree laid out in space from a seed, and the projection of a point onto the screen. The canvas
// that draws it is HomeBackdrop.tsx.

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
export interface Mesh {
  nodes: MeshNode[];
  /** Pairs of node indices between siblings: the faint lines that make the tree read as a mesh. */
  ties: [number, number][];
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
  const ties: [number, number][] = [];
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
    for (let i = 0; i < level.children; i++) ties.push([first + i, first + ((i + 1) % level.children)]);
    for (let i = 0; i < level.children; i++) grow(first + i, depth + 1);
  };
  grow(0, 0);
  return { nodes, ties };
}

export interface Projected {
  x: number;
  y: number;
  /** Size factor from perspective: nearer is larger. */
  scale: number;
  /** 0 (far) … 1 (near), for fading what is behind. */
  near: number;
}

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
  const TILT = 0.32;
  const y = point.y * Math.cos(TILT) - z0 * Math.sin(TILT);
  const z = point.y * Math.sin(TILT) + z0 * Math.cos(TILT);
  const CAMERA = 3.2;
  const scale = CAMERA / (CAMERA + z);
  return {
    x: cx + x * unit * scale,
    y: cy + y * unit * scale,
    scale,
    near: Math.max(0, Math.min(1, (1 - z) / 2)),
  };
}
