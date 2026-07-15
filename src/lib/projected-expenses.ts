import { prisma } from "@/lib/prisma";
import { resolveRecurringSplitConfig, type ResolvedSplit } from "@/lib/split-calculator";

export interface ProjectedExpense {
  id: string;
  householdId: string;
  title: string;
  amount: number;
  categoryId: string | null;
  paidBy: string;
  date: Date;
  splitType: "PERCENT" | "FIXED";
  notes: null;
  recurringId: string;
  splits: ResolvedSplit[];
  projected: true;
}

function lastDayOfMonth(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/**
 * Computes non-persisted "scheduled" expenses for a future (or current)
 * month from active RecurringExpense templates. Never written to the DB,
 * never fed into balance/settlement calculations, and skipped for any
 * template that already has a real generated Expense for that month.
 */
export async function getProjectedExpenses(
  householdId: string,
  year: number,
  monthIndex0: number
): Promise<ProjectedExpense[]> {
  const monthStart = new Date(year, monthIndex0, 1);
  const monthEnd = new Date(year, monthIndex0 + 1, 1);

  const templates = await prisma.recurringExpense.findMany({
    where: {
      householdId,
      active: true,
      startDate: { lt: monthEnd },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
    },
    include: { overrides: true },
  });

  if (templates.length === 0) return [];

  const alreadyGenerated = await prisma.expense.findMany({
    where: {
      householdId,
      recurringId: { in: templates.map((t) => t.id) },
      date: { gte: monthStart, lt: monthEnd },
    },
    select: { recurringId: true },
  });
  const generatedRecurringIds = new Set(alreadyGenerated.map((e) => e.recurringId));

  const members = await prisma.householdMember.findMany({
    where: { householdId, leftAt: null },
  });
  const memberShares = members.map((m) => ({
    userId: m.userId,
    defaultSplitPercent: m.defaultSplitPercent ? Number(m.defaultSplitPercent) : null,
  }));

  const projected: ProjectedExpense[] = [];

  for (const template of templates) {
    if (generatedRecurringIds.has(template.id)) continue;

    const day = Math.min(template.dayOfMonth, lastDayOfMonth(year, monthIndex0));
    const date = new Date(year, monthIndex0, day);

    const splits = resolveRecurringSplitConfig({
      splitType: template.splitType,
      amount: Number(template.amount),
      members: memberShares,
      overrides: template.overrides.map((o) => ({
        userId: o.userId,
        percent: o.percent ? Number(o.percent) : null,
        amountOwed: o.amountOwed ? Number(o.amountOwed) : null,
      })),
    });

    projected.push({
      id: `projected:${template.id}:${year}-${monthIndex0 + 1}`,
      householdId,
      title: template.title,
      amount: Number(template.amount),
      categoryId: template.categoryId,
      paidBy: template.paidBy,
      date,
      splitType: template.splitType,
      notes: null,
      recurringId: template.id,
      splits,
      projected: true,
    });
  }

  return projected.sort((a, b) => a.date.getTime() - b.date.getTime());
}
