import type { ExpenseInput } from "@/lib/expense-schema";
import {
  distributePercentSplit,
  resolveFixedSplit,
  validateFixedTotal,
  validatePercentTotal,
  type ResolvedSplit,
} from "@/lib/split-calculator";

export class ExpenseValidationError extends Error {}

/** Validates and resolves an expense's splits into exact per-user cent amounts. */
export function resolveExpenseSplits(
  input: Pick<ExpenseInput, "amount" | "splitType" | "splits">,
  activeMemberIds: Set<string>
): ResolvedSplit[] {
  for (const split of input.splits) {
    if (!activeMemberIds.has(split.userId)) {
      throw new ExpenseValidationError(`${split.userId} is not an active member of this household.`);
    }
  }

  if (input.splitType === "PERCENT") {
    const shares = input.splits.map((s) => {
      if (s.percent === undefined) {
        throw new ExpenseValidationError("Every split needs a percent for PERCENT-type expenses.");
      }
      return { userId: s.userId, percent: s.percent };
    });
    if (!validatePercentTotal(shares)) {
      throw new ExpenseValidationError("Split percentages must sum to 100%.");
    }
    return distributePercentSplit(input.amount, shares);
  }

  const shares = input.splits.map((s) => {
    if (s.amountOwed === undefined) {
      throw new ExpenseValidationError("Every split needs an amount for FIXED-type expenses.");
    }
    return { userId: s.userId, amountOwed: s.amountOwed };
  });
  if (!validateFixedTotal(input.amount, shares)) {
    throw new ExpenseValidationError("Fixed split amounts must sum to the expense total.");
  }
  return resolveFixedSplit(shares);
}
