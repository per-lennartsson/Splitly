import { prisma } from "@/lib/prisma";
import { calculateBalances, type BalanceResult } from "@/lib/balance-engine";
import { ensureRecurringGenerated } from "@/lib/recurring-generator";

/**
 * Loads a household's real (non-deleted, non-projected) expenses and
 * settlements from the DB and runs them through the pure balance engine.
 * All-time by design — settlements can pay down debt from any prior month,
 * so balances are never reset at a month boundary.
 */
export async function getHouseholdBalances(householdId: string): Promise<BalanceResult> {
  // Catches up any due-but-ungenerated recurring expenses before reading —
  // a no-op for households with no active templates. Replaces a nightly cron.
  await ensureRecurringGenerated(householdId);

  const [expenses, settlements] = await Promise.all([
    prisma.expense.findMany({
      where: { householdId, deletedAt: null },
      include: { splits: true },
    }),
    prisma.settlement.findMany({ where: { householdId } }),
  ]);

  return calculateBalances(
    expenses.map((e) => ({
      id: e.id,
      amount: Number(e.amount),
      paidBy: e.paidBy,
      splits: e.splits.map((s) => ({ userId: s.userId, amountOwed: Number(s.amountOwed) })),
    })),
    settlements.map((s) => ({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amount: Number(s.amount),
    }))
  );
}
