// Money is handled internally as integer cents to avoid floating-point drift,
// and surfaced to callers as plain numbers (dollars) rounded to 2 decimals.

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}
