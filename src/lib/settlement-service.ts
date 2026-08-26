import { prisma } from "@/lib/prisma";

export class SettlementValidationError extends Error {}

/**
 * Validates that every expense a settlement claims to cover is a real,
 * non-deleted household expense that `toUserId` paid and `fromUserId` owes a
 * split on — i.e. an expense that actually contributes to the debt this
 * payment is settling. Throws on any mismatch; returns nothing on success.
 */
export async function validateSettlementExpenseIds(
  householdId: string,
  fromUserId: string,
  toUserId: string,
  expenseIds: string[]
): Promise<void> {
  if (expenseIds.length === 0) return;

  const uniqueIds = Array.from(new Set(expenseIds));
  const expenses = await prisma.expense.findMany({
    where: { id: { in: uniqueIds }, householdId, deletedAt: null },
    include: { splits: true },
  });

  if (expenses.length !== uniqueIds.length) {
    throw new SettlementValidationError("One or more selected expenses could not be found in this household.");
  }

  for (const expense of expenses) {
    const coversDebt = expense.paidBy === toUserId && expense.splits.some((s) => s.userId === fromUserId);
    if (!coversDebt) {
      throw new SettlementValidationError(`"${expense.title}" is not an expense this payment can settle.`);
    }
  }
}

/** Every expense id tagged on any settlement in a household — i.e. expenses already marked as paid. */
export async function getSettledExpenseIds(householdId: string): Promise<Set<string>> {
  const settlements = await prisma.settlement.findMany({
    where: { householdId },
    select: { expenseIds: true },
  });
  return new Set(settlements.flatMap((s) => s.expenseIds));
}

/** Throws if the given expense is already tagged on a settlement — such an expense is locked from further edits. */
export async function assertExpenseNotSettled(householdId: string, expenseId: string): Promise<void> {
  const settlement = await prisma.settlement.findFirst({
    where: { householdId, expenseIds: { has: expenseId } },
  });
  if (settlement) {
    throw new SettlementValidationError("This expense is part of a recorded payment and can no longer be edited or deleted.");
  }
}
