// The Lehto (grove) theme (owner request 2026-11-12, UI_INVENTORY S-15): pure geometry and seeding for its decorations.
// Nothing here reads a clock, `Math.random` or the DOM; every choice is derived from stable ids so a tree always
// looks the same and tests can use literal oracles.

/** More visible cards than this and the grove stops animating and shows no creatures (phones, big trees). */
export const GROVE_CALM_ABOVE = 150;
export const GROVE_MAX_CREATURES = 10;

export const CREATURE_KINDS = ['squirrel', 'owl', 'butterfly', 'snail'] as const;
export type CreatureKind = (typeof CREATURE_KINDS)[number];

export function groveCalm(visibleCards: number): boolean {
  return visibleCards > GROVE_CALM_ABOVE;
}

/** FNV-1a, 32 bit: a stable, dependency-free hash of an id. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface Creature {
  /** The child card whose branch carries the creature. */
  id: string;
  kind: CreatureKind;
  /** Animation length in seconds and start delay, so the creatures do not move in step. */
  dur: number;
  delay: number;
}

/** About one branch in five carries a creature, at most `max`; the pick of an id never depends on the other ids. */
export function pickCreatures(childIds: readonly string[], max: number = GROVE_MAX_CREATURES): Creature[] {
  if (max <= 0) return [];
  return childIds
    .map((id) => ({ id, h: hashId(id) }))
    .filter(({ h }) => h % 5 === 0)
    .sort((a, b) => a.h - b.h || (a.id < b.id ? -1 : 1))
    .slice(0, max)
    .map(({ id, h }) => ({
      id,
      kind: CREATURE_KINDS[(h >>> 8) % CREATURE_KINDS.length] as CreatureKind,
      dur: 14 + ((h >>> 12) % 13),
      delay: -((h >>> 16) % 14),
    }));
}

export interface CrownBlob {
  x: number;
  y: number;
  r: number;
  /** 0…2: the leaf tone, darkest to lightest. */
  tone: number;
}

/** The crown's half-width and half-height: a fixed size around the main claim's card. It used to grow with the
 * width of the whole tree, which pushed the clusters away from the card as soon as a sub-tree was opened and left
 * the middle empty (owner's report 2026-11-19). */
export const CROWN_RX = 330;
export const CROWN_RY = 200;
/** Clusters per ring, outermost first: the innermost ring fills the middle, behind the card itself. */
const CROWN_RINGS = [
  { count: 12, at: 1 },
  { count: 8, at: 0.58 },
  { count: 3, at: 0.18 },
] as const;

/** Overlapping leaf clusters forming a full crown centred on the main claim at (cx, cy). */
export function crownBlobs(cx: number, cy: number): CrownBlob[] {
  const blobs: CrownBlob[] = [];
  let seed = 7919;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (const ring of CROWN_RINGS)
    for (let i = 0; i < ring.count; i += 1) {
      const angle = Math.PI * (1 + (2 * i) / ring.count);
      blobs.push({
        x: Math.round(cx + Math.cos(angle) * CROWN_RX * ring.at + (next() - 0.5) * 50),
        y: Math.round(cy + Math.sin(angle) * CROWN_RY * ring.at + (next() - 0.5) * 40),
        r: Math.round(105 + next() * 60),
        tone: Math.floor(next() * 3),
      });
    }
  return blobs;
}

export interface FoliageCard {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 for the main claim, 1 for its reasons, and so on. */
  depth: number;
}
export interface FoliageBlob extends CrownBlob {
  /** 0…1: how strongly the cluster is drawn; it thins with depth. */
  strength: number;
}
/** How large and how strong a card's foliage is at each depth: the crown is widest at the main claim and thins
 * towards the twigs, so a tree drawn from the top down still reads as a crown and not as a hedge. */
const FOLIAGE_BY_DEPTH = [
  { scale: 1, strength: 0 },
  { scale: 1, strength: 0.95 },
  { scale: 0.8, strength: 0.75 },
  { scale: 0.64, strength: 0.55 },
  { scale: 0.52, strength: 0.4 },
] as const;

/** Leaf clusters behind every card below the main claim (owner 2026-11-19: the haze should not stop at the root):
 * three per card, placed by the card's id so they stay put when the tree is redrawn, leaning above the card. */
export function foliageBlobs(cards: readonly FoliageCard[]): FoliageBlob[] {
  const blobs: FoliageBlob[] = [];
  for (const card of cards) {
    if (card.depth < 1) continue;
    const level = FOLIAGE_BY_DEPTH[Math.min(card.depth, FOLIAGE_BY_DEPTH.length - 1)]!;
    const h = hashId(card.id);
    const cx = card.x + card.w / 2;
    const cy = card.y + card.h / 2;
    // Wider than the mist that is laid over it, so the green shows as a rim around the pale middle.
    const r = Math.max(card.w * 0.85, card.h * 1.5) * level.scale;
    const jitter = (shift: number) => (((h >>> shift) & 31) / 31 - 0.5) * r * 0.3;
    const places = [
      [-0.55, -0.3, 0.9],
      [0.55, -0.34, 0.95],
      [0, 0.12, 1.1],
    ] as const;
    places.forEach(([dx, dy, size], i) => {
      blobs.push({
        x: Math.round(cx + dx * r + jitter(i * 5)),
        y: Math.round(cy + dy * r + jitter(i * 5 + 3)),
        r: Math.round(r * size),
        tone: (h + i) % 3,
        strength: level.strength,
      });
    });
  }
  return blobs;
}
