// On a phone the inspector is a sheet at the foot of the tree with three heights (WG-042, owner 2026-11-19,
// UI_INVENTORY S-15): `low` shows its handle only, `half` the claim and its first slider beside the selected card,
// `full` nearly all of the screen. Inspector.tsx keeps the height for the session and styles.css draws it.
export const SHEET_SIZES = ['low', 'half', 'full'] as const;
export type SheetSize = (typeof SHEET_SIZES)[number];

/** The next height: a drag goes one step up or down and stays at the ends; a tap goes up and, from the top, back to
 * the lowest, so one finger reaches every height. */
export function nextSheetSize(size: SheetSize, move: 'up' | 'down' | 'tap'): SheetSize {
  const i = SHEET_SIZES.indexOf(size);
  if (move === 'tap') return SHEET_SIZES[(i + 1) % SHEET_SIZES.length] as SheetSize;
  return SHEET_SIZES[
    Math.max(0, Math.min(SHEET_SIZES.length - 1, i + (move === 'up' ? 1 : -1)))
  ] as SheetSize;
}
