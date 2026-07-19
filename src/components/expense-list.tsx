"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { addMonths, formatMonthLabel } from "@/lib/date-utils";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { intlLocale, type Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";
import { ExpenseRow } from "@/components/expense-row";

export interface ExpenseVM {
  id: string;
  title: string;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  paidByName: string;
  paidByIsPlaceholder?: boolean;
  date: string;
  projected: boolean;
}

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
}

export function ExpenseList({
  householdId,
  householdType,
  currency,
  locale,
  expenses,
  categories,
  monthNav,
}: {
  householdId: string;
  householdType: "RECURRING" | "EVENT";
  currency: CurrencyCode;
  locale: Locale;
  expenses: ExpenseVM[];
  categories: CategoryOption[];
  monthNav?: { year: number; monthIndex0: number; isCurrentOrPast: boolean };
}) {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, currency, intlLocale(locale));

  const filtered = useMemo(
    () => (categoryFilter === null ? expenses : expenses.filter((e) => e.categoryId === categoryFilter)),
    [expenses, categoryFilter]
  );
  const actual = useMemo(() => filtered.filter((e) => !e.projected), [filtered]);
  const scheduled = useMemo(() => filtered.filter((e) => e.projected), [filtered]);

  const totalsByCategory = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; total: number }>();
    for (const e of expenses) {
      if (e.projected) continue;
      const key = e.categoryId ?? "uncategorized";
      const existing = map.get(key);
      if (existing) {
        existing.total += e.amount;
      } else {
        map.set(key, {
          id: key,
          name: e.categoryName ?? t(locale, "categories.uncategorized"),
          color: e.categoryColor ?? "#94a3b8",
          total: e.amount,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, locale]);

  const grandTotal = totalsByCategory.reduce((sum, c) => sum + c.total, 0);
  const runningTotal = expenses.filter((e) => !e.projected).reduce((sum, e) => sum + e.amount, 0);

  async function handleDelete(id: string) {
    if (!confirm(t(locale, "expenseList.deleteConfirm"))) return;
    setBusyId(id);
    await fetch(`/api/households/${householdId}/expenses/${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div>
      {monthNav ? (
        (() => {
          const prev = addMonths(monthNav.year, monthNav.monthIndex0, -1);
          const next = addMonths(monthNav.year, monthNav.monthIndex0, 1);
          return (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/households/${householdId}/expenses?y=${prev.year}&m=${prev.monthIndex0}`}
                  title={t(locale, "expenseList.prev")}
                  className="icon-btn h-8 w-8 border border-slate-200 bg-white"
                >
                  ‹
                </Link>
                <h2 className="min-w-[120px] text-center text-xl font-bold tracking-tight text-slate-900">
                  {formatMonthLabel(monthNav.year, monthNav.monthIndex0, intlLocale(locale))}
                </h2>
                <Link
                  href={`/households/${householdId}/expenses?y=${next.year}&m=${next.monthIndex0}`}
                  title={t(locale, "expenseList.next")}
                  className="icon-btn h-8 w-8 border border-slate-200 bg-white"
                >
                  ›
                </Link>
              </div>
              <p className="text-sm text-slate-500">
                {t(locale, "expenseList.actualTotal")}{" "}
                <span className="text-[17px] font-bold tabular-nums text-slate-900">{money(runningTotal)}</span>
              </p>
            </div>
          );
        })()
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{t(locale, "expenseList.expensesTitle")}</h2>
          <p className="text-sm text-slate-500">
            {t(locale, "expenseList.runningTotal")}{" "}
            <span className="text-[17px] font-bold tabular-nums text-slate-900">{money(runningTotal)}</span>
          </p>
        </div>
      )}

      {totalsByCategory.length > 0 && (
        <div className="card mt-4">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {totalsByCategory.map((c) => (
              <div
                key={c.id}
                className="h-full"
                style={{
                  backgroundColor: c.color,
                  width: grandTotal > 0 ? `${(c.total / grandTotal) * 100}%` : 0,
                  opacity: categoryFilter === null || categoryFilter === c.id ? 1 : 0.25,
                }}
              />
            ))}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={clsx("pill", categoryFilter === null ? "pill-active" : "pill-inactive")}
            >
              {t(locale, "expenseList.allChip")}
            </button>
            {categories.map((c) => {
              const total = totalsByCategory.find((tc) => tc.id === c.id)?.total ?? 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryFilter((prev) => (prev === c.id ? null : c.id))}
                  className={clsx("pill", categoryFilter === c.id ? "pill-active" : "pill-inactive")}
                >
                  <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                  <span className="font-normal text-slate-400">{money(total)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {scheduled.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t(locale, "expenseList.upcomingThisMonth")}
          </p>
          <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50/60 py-1">
            {scheduled.map((e) => (
              <ExpenseRow
                key={e.id}
                title={e.title}
                meta={`${e.date} · ${t(locale, "expenseList.paidBy", { name: e.paidByName })}${
                  e.paidByIsPlaceholder ? ` (${t(locale, "common.guestBadge")})` : ""
                }`}
                amount={money(e.amount)}
                categoryName={e.categoryName}
                categoryColor={e.categoryColor}
                projected
                locale={locale}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t(locale, "expenseList.recordedExpenses")}
        </p>
        <div className="rounded-[20px] border border-slate-200 bg-white py-1 shadow-sm">
          {actual.length === 0 ? (
            <p className="px-6 py-5 text-sm text-slate-400">{t(locale, "expenseList.noExpensesHere")}</p>
          ) : (
            actual.map((e) => (
              <ExpenseRow
                key={e.id}
                title={e.title}
                meta={`${e.date} · ${t(locale, "expenseList.paidBy", { name: e.paidByName })}${
                  e.paidByIsPlaceholder ? ` (${t(locale, "common.guestBadge")})` : ""
                }`}
                amount={money(e.amount)}
                categoryName={e.categoryName}
                categoryColor={e.categoryColor}
                editHref={`/households/${householdId}/expenses/${e.id}/edit`}
                onDelete={() => handleDelete(e.id)}
                deleteBusy={busyId === e.id}
                locale={locale}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
