// Number formatting for the review notation: "75%/+5", signed balances, and "—" for missing (never 0).
export const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));
export const EM_DASH = '—';
export const balanceText = (balance: number | null): string =>
  balance === null ? EM_DASH : signed(Math.round(balance * 10) / 10);
export const credenceText = (credence: number | null): string =>
  credence === null ? EM_DASH : `${Math.round(credence)}%`;
export const influenceText = (influence: number | null): string =>
  influence === null ? EM_DASH : signed(Math.round(influence * 10) / 10);
/** The compact "75%/+5" pair; either half may be missing. */
export const pairText = (credence: number | null, influence: number | null | undefined): string =>
  influence === undefined ? credenceText(credence) : `${credenceText(credence)}/${influenceText(influence)}`;
