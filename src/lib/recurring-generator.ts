import { prisma } from "@/lib/prisma";
import { resolveRecurringSplitConfig } from "@/lib/split-calculator";
import type { RecurringExpense, RecurringSplitOverride } from "@prisma/client";

type Template = RecurringExpense & { overrides: RecurringSplitOverride[] };

function lastDayOfMonth(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function monthsFromTo(start: Date, end: Date): { year: number; monthIndex0: number }[] {
  const months: { year: number; monthIndex0: number }[] = [];
  let year = start.getFullYear();
  let monthIndex0 = start.getMonth();
  const endYear = end.getFullYear();
  const endMonthIndex0 = end.getMonth();
  while (year < endYear || (year === endYear && monthIndex0 <= endMonthIndex0)) {
    months.push({ year, monthIndex0 });
    monthIndex0 += 1;
    if (monthIndex0 > 11) {
      monthIndex0 = 0;
      year += 1;
    }
  }
  return months;
}

/**
 * Creates the actual Expense + ExpenseSplit rows for one template for the
 * month containing `monthDate`, if it hasn't already been generated.
 * Idempotent — checks for an existing Expense tied to that template within
 * the month first.
 */
async function generateForTemplateAndMonth(template: Template, monthDate: Date): Promise<boolean> {
  const year = monthDate.getFullYear();
  const monthIndex0 = monthDate.getMonth();
  const monthStart = new Date(year, monthIndex0, 1);
  const monthEnd = new Date(year, monthIndex0 + 1, 1);

  const existing = await prisma.expense.findFirst({
    where: { recurringId: template.id, date: { gte: monthStart, lt: monthEnd } },
  });
  if (existing) return false;

  const members = await prisma.householdMember.findMany({
    where: { householdId: template.householdId, leftAt: null },
  });

  const splits = resolveRecurringSplitConfig({
    splitType: template.splitType,
    amount: Number(template.amount),
    members: members.map((m) => ({
      userId: m.userId,
      defaultSplitPercent: m.defaultSplitPercent ? Number(m.defaultSplitPercent) : null,
    })),
    overrides: template.overrides.map((o) => ({
      userId: o.userId,
      percent: o.percent ? Number(o.percent) : null,
      amountOwed: o.amountOwed ? Number(o.amountOwed) : null,
    })),
  });

  if (splits.length === 0) return false;

  const due = Math.min(template.dayOfMonth, lastDayOfMonth(year, monthIndex0));

  await prisma.expense.create({
    data: {
      householdId: template.householdId,
      title: template.title,
      amount: template.amount,
      categoryId: template.categoryId,
      paidBy: template.paidBy,
      date: new Date(year, monthIndex0, due),
      splitType: template.splitType,
      recurringId: template.id,
      splits: {
        create: splits.map((s) => ({
          userId: s.userId,
          percent: s.percent,
          amountOwed: s.amountOwed,
        })),
      },
    },
  });

  return true;
}

/**
 * Backfills every month from a template's startDate up to `now` (bounded by
 * endDate) that is due but hasn't generated an Expense yet. Due dates in the
 * current month that haven't arrived yet are skipped; every earlier month in
 * the range is always due. Safe to call repeatedly — each month is a no-op
 * once generated.
 */
async function ensureGeneratedForTemplate(template: Template, now: Date): Promise<number> {
  const rangeEnd = template.endDate && template.endDate < now ? template.endDate : now;
  if (template.startDate > rangeEnd) return 0;

  let created = 0;
  for (const { year, monthIndex0 } of monthsFromTo(template.startDate, rangeEnd)) {
    const isCurrentMonth = year === now.getFullYear() && monthIndex0 === now.getMonth();
    if (isCurrentMonth) {
      const due = Math.min(template.dayOfMonth, lastDayOfMonth(year, monthIndex0));
      if (due > now.getDate()) continue; // this month's due date hasn't arrived yet
    }
    const didCreate = await generateForTemplateAndMonth(template, new Date(year, monthIndex0, 1));
    if (didCreate) created += 1;
  }
  return created;
}

/**
 * Catches up every active recurring template in a household: generates any
 * real Expense rows that are due but missing, from each template's start
 * date up through today. Called from read paths (dashboard, expense list,
 * balance calculation) instead of a background cron job — generation simply
 * happens the next time someone looks.
 */
export async function ensureRecurringGenerated(
  householdId: string,
  now: Date = new Date()
): Promise<{ created: number }> {
  const templates = await prisma.recurringExpense.findMany({
    where: { householdId, active: true, startDate: { lte: now } },
    include: { overrides: true },
  });

  let created = 0;
  for (const template of templates) {
    created += await ensureGeneratedForTemplate(template, now);
  }
  return { created };
}

/**
 * Same catch-up, scoped to a single template. Used right after a
 * create/update/reactivate so the new or changed template doesn't wait for
 * someone to view the household's dashboard/expenses page.
 */
export async function ensureTemplateGenerated(recurringId: string, now: Date = new Date()): Promise<number> {
  const template = await prisma.recurringExpense.findUnique({
    where: { id: recurringId },
    include: { overrides: true },
  });
  if (!template || !template.active) return 0;
  return ensureGeneratedForTemplate(template, now);
}
