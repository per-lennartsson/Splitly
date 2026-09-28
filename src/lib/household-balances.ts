import { prisma } from "@/lib/prisma";
import { calculateBalances, type BalanceResult } from "@/lib/balance-engine";
import { ensureRecurringGenerated } from "@/lib/recurring-generator";
import { allocateSettlements, type ExpenseShareStatus } from "@/lib/expense-settlement";

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

export interface OpenExpenseShare extends ExpenseShareStatus {
  title: string;
  date: Date;
}

export type ExpenseSettlementBadge = "settled" | "partial";

async function loadExpenseShareStatuses(householdId: string) {
  await ensureRecurringGenerated(householdId);

  const [expenses, settlements] = await Promise.all([
    prisma.expense.findMany({
      where: { householdId, deletedAt: null },
      include: { splits: true },
    }),
    prisma.settlement.findMany({ where: { householdId } }),
  ]);

  const statuses = allocateSettlements(
    expenses.map((e) => ({
      id: e.id,
      date: e.date,
      paidBy: e.paidBy,
      splits: e.splits.map((s) => ({ userId: s.userId, amountOwed: Number(s.amountOwed) })),
    })),
    settlements.map((s) => ({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amount: Number(s.amount),
      expenseIds: s.expenseIds,
    }))
  );

  return { expenses, statuses };
}

/**
 * Per-expense settlement status for a household: which debtor→creditor shares
 * are paid off and how much of each is still open. Only open shares are
 * returned, oldest first.
 */
export async function getOpenExpenseShares(householdId: string): Promise<OpenExpenseShare[]> {
  const { expenses, statuses } = await loadExpenseShareStatuses(householdId);
  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  return statuses
    .filter((s) => s.remaining > 0)
    .map((s) => {
      const expense = expenseById.get(s.expenseId)!;
      return { ...s, title: expense.title, date: expense.date };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * One badge per expense for list views: "settled" when every other member's
 * share is paid off, "partial" when some of it is. Expenses nobody else owes
 * on (or with nothing paid yet) are left out.
 */
export async function getExpenseSettlementBadges(
  householdId: string
): Promise<Record<string, ExpenseSettlementBadge>> {
  const { statuses } = await loadExpenseShareStatuses(householdId);
  const totals = new Map<string, { paid: number; remaining: number }>();
  for (const s of statuses) {
    const t = totals.get(s.expenseId) ?? { paid: 0, remaining: 0 };
    t.paid += s.paid;
    t.remaining += s.remaining;
    totals.set(s.expenseId, t);
  }
  const badges: Record<string, ExpenseSettlementBadge> = {};
  for (const [expenseId, t] of totals) {
    if (t.remaining <= 0) badges[expenseId] = "settled";
    else if (t.paid > 0) badges[expenseId] = "partial";
  }
  return badges;
}
