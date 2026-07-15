import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import clsx from "clsx";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdBalances } from "@/lib/household-balances";
import { ensureRecurringGenerated } from "@/lib/recurring-generator";
import { getProjectedExpenses } from "@/lib/projected-expenses";
import { budgetProgressPercent, budgetStatus } from "@/lib/budget";
import { formatMonthLabel } from "@/lib/date-utils";
import { intlLocale } from "@/lib/i18n/translations";
import { t, tPlural } from "@/lib/i18n/t";
import { formatMoney } from "@/lib/currency";
import { ExpenseRow } from "@/components/expense-row";

const PROGRESS_CLASSES: Record<string, string> = {
  ok: "bg-positive-500",
  warning: "bg-warning-500",
  over: "bg-negative-500",
  "no-limit": "bg-slate-300",
};

export default async function DashboardPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const locale = session.user.locale;

  const household = await prisma.household.findFirst({
    where: { id: params.id, members: { some: { userId: session.user.id, leftAt: null } } },
  });
  if (!household) redirect("/households");

  const now = new Date();
  const isRecurring = household.householdType === "RECURRING";
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Must finish before the queries below so a just-generated recurring
  // expense shows up in this same page load, not the next one.
  await ensureRecurringGenerated(params.id, now);

  const [recentExpenses, monthTotalAgg, { netPositions }, categories, spendByCategory, projected] = await Promise.all([
    prisma.expense.findMany({
      where: { householdId: params.id, deletedAt: null },
      include: { payer: { select: { name: true } }, category: true },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.expense.aggregate({
      where: {
        householdId: params.id,
        deletedAt: null,
        ...(isRecurring ? { date: { gte: monthStart, lt: monthEnd } } : {}),
      },
      _sum: { amount: true },
    }),
    getHouseholdBalances(params.id),
    prisma.category.findMany({ where: { householdId: params.id }, orderBy: { name: "asc" } }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: {
        householdId: params.id,
        deletedAt: null,
        categoryId: { not: null },
        ...(isRecurring ? { date: { gte: monthStart, lt: monthEnd } } : {}),
      },
      _sum: { amount: true },
    }),
    isRecurring ? getProjectedExpenses(params.id, now.getFullYear(), now.getMonth()) : Promise.resolve([]),
  ]);

  const myPosition = netPositions.find((p) => p.userId === session.user.id);
  const monthTotal = Number(monthTotalAgg._sum.amount ?? 0);
  const money = (n: number) => formatMoney(n, household.currency, intlLocale(locale));
  const balance = myPosition?.netBalance ?? 0;

  const spendMap = Object.fromEntries(spendByCategory.map((s) => [s.categoryId as string, Number(s._sum.amount ?? 0)]));
  const budgeted = categories
    .filter((c) => c.budgetLimit !== null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      limit: Number(c.budgetLimit),
      spent: spendMap[c.id] ?? 0,
    }));

  return (
    <div>
      <div className="rounded-[20px] bg-brand-900 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-brand-300">
              {isRecurring ? formatMonthLabel(now.getFullYear(), now.getMonth(), intlLocale(locale)) : t(locale, "dashboard.runningTotal")}
            </p>
            <p className="mt-1.5 text-[34px] font-bold leading-10 tracking-tight tabular-nums">{money(monthTotal)}</p>
            <p className="mt-1 text-[13px] text-brand-300">
              {isRecurring ? (
                <>
                  {t(locale, "dashboard.spentSoFar")}
                  {projected.length > 0 && (
                    <> · {tPlural(locale, projected.length, "dashboard.billsLeftOne", "dashboard.billsLeftOther")}</>
                  )}
                </>
              ) : (
                t(locale, "dashboard.spentSoFar")
              )}
            </p>
          </div>
          <div className="flex min-w-[180px] flex-col justify-center gap-1.5">
            <p className="text-[13px] text-brand-300">{t(locale, "dashboard.yourBalance")}</p>
            <p
              className={clsx(
                "text-[22px] font-bold tabular-nums",
                balance > 0 && "text-emerald-300",
                balance < 0 && "text-rose-300",
                balance === 0 && "text-white"
              )}
            >
              {balance > 0 && "+"}
              {money(Math.abs(balance))}
            </p>
            <Link
              href={`/households/${params.id}/settle-up`}
              className="self-start rounded-[10px] border border-white/25 bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-white/20"
            >
              {t(locale, "dashboard.settleUpCta")}
            </Link>
          </div>
        </div>
      </div>

      {budgeted.length > 0 && (
        <div className="card mt-4">
          <div className="mb-3.5 flex items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold text-slate-900">{t(locale, "dashboard.budgetsTitle")}</p>
            <Link href={`/households/${params.id}/categories`} className="text-[13px] font-medium text-brand-600 hover:text-brand-700">
              {t(locale, "expenseList.allCategories")}
            </Link>
          </div>
          <div className="flex flex-col gap-3.5">
            {budgeted.map((b) => {
              const status = budgetStatus(b.spent, b.limit);
              const pct = budgetProgressPercent(b.spent, b.limit);
              return (
                <div key={b.id}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="flex items-center gap-2 font-medium text-slate-900">
                      <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: b.color }} />
                      {b.name}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {t(locale, "categories.spentOfLimit", { spent: money(b.spent), limit: money(b.limit) })}{" "}
                      {status === "warning" && <span className="font-semibold text-warning-600">{t(locale, "categories.nearLimit")}</span>}
                      {status === "over" && <span className="font-semibold text-negative-600">{t(locale, "categories.overBudget")}</span>}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={clsx("h-full rounded-full", PROGRESS_CLASSES[status])} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white py-2 shadow-sm">
        <div className="flex items-baseline justify-between gap-3 px-6 pb-1.5 pt-3">
          <p className="text-[15px] font-semibold text-slate-900">{t(locale, "dashboard.recentExpenses")}</p>
          <Link
            href={`/households/${params.id}/expenses`}
            className="text-[13px] font-medium text-brand-600 hover:text-brand-700"
          >
            {isRecurring ? t(locale, "dashboard.monthViewBtn") : t(locale, "dashboard.allExpensesBtn")}
          </Link>
        </div>
        {recentExpenses.length === 0 ? (
          <p className="px-6 py-4 text-sm text-slate-400">{t(locale, "dashboard.noExpensesYet")}</p>
        ) : (
          <div className="flex flex-col">
            {recentExpenses.map((e) => (
              <ExpenseRow
                key={e.id}
                title={e.title}
                meta={`${e.date.toISOString().slice(0, 10)} · ${t(locale, "dashboard.paidBy", { name: e.payer.name })}`}
                amount={money(Number(e.amount))}
                categoryName={e.category?.name ?? null}
                categoryColor={e.category?.color ?? null}
                locale={locale}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
