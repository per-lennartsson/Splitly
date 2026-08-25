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
