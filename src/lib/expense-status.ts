/**
 * True when no one other than the payer owes anything on an expense — e.g. a
 * bill split 100% to the person who paid it. There's no debt to settle, so the
 * expense counts as paid from the moment it's recorded.
 */
export function nothingOwedByOthers(
  paidBy: string,
  splits: { userId: string; amountOwed: number | { toString(): string } }[]
): boolean {
  return !splits.some((s) => s.userId !== paidBy && Number(s.amountOwed) > 0);
}
