/**
 * Money is kept as dollars in the UI and stored as integer cents in D1, so
 * every saved amount has exactly two decimal places.
 */

/** Rounds dollars to the nearest cent, half away from zero (1.005 -> 101, -1.005 -> -101). */
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  // Shifting via the decimal string avoids binary errors such as 1.005 * 100 === 100.49999...
  const abs = Math.abs(dollars);
  // Very large values already print in exponent form; plain multiplication is exact enough there.
  const cents = Math.round(String(abs).includes("e") ? abs * 100 : Number(`${abs}e2`));
  return dollars < 0 ? -cents : cents;
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function roundMoney(dollars: number): number {
  return fromCents(toCents(dollars));
}
