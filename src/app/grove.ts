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

/** Overlapping leaf clusters forming the large crown around the main claim at (cx, cy). */
export function crownBlobs(cx: number, cy: number, spread: number): CrownBlob[] {
  const rx = Math.max(560, spread);
  const blobs: CrownBlob[] = [];
  let seed = 7919;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 34; i += 1) {
    const angle = Math.PI * (1 + (i % 17) / 16);
    const ring = i < 17 ? 1 : 0.62;
    blobs.push({
      x: Math.round(cx + Math.cos(angle) * rx * ring + (next() - 0.5) * 90),
      y: Math.round(cy - 30 + Math.sin(angle) * rx * 0.34 * ring + (next() - 0.5) * 60),
      r: Math.round(110 + next() * 90),
      tone: Math.floor(next() * 3),
    });
  }
  return blobs;
}
