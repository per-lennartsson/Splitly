import { fromCents, toCents } from "@/lib/money";

/**
 * Totals what each member owes across a set of splits — e.g. a month's real
 * expense splits plus its projected ones — summed in cents to avoid float drift.
 * Returned largest share first.
 */
export function sumSharesByUser(
  splits: { userId: string; amountOwed: number }[]
): { userId: string; amount: number }[] {
  const cents = new Map<string, number>();
  for (const s of splits) {
    cents.set(s.userId, (cents.get(s.userId) ?? 0) + toCents(s.amountOwed));
  }
  return Array.from(cents, ([userId, c]) => ({ userId, amount: fromCents(c) })).sort((a, b) => b.amount - a.amount);
}
