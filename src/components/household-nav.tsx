"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { Locale } from "@/lib/i18n/translations";
import { t, tPlural } from "@/lib/i18n/t";
import type { CurrencyCode } from "@/lib/currency";
import { QuickAddExpenseSheet, type QuickAddCategory, type QuickAddMember } from "@/components/quick-add-expense-sheet";

export function HouseholdNav({
  householdId,
  householdName,
  householdType,
  currency,
  locale,
  members,
  categories,
}: {
  householdId: string;
  householdName: string;
  householdType: "RECURRING" | "EVENT";
  currency: CurrencyCode;
  locale: Locale;
  members: QuickAddMember[];
  categories: QuickAddCategory[];
}) {
  const pathname = usePathname();
  const base = `/households/${householdId}`;
  const [sheetOpen, setSheetOpen] = useState(false);

  const tabs = [
    { href: `${base}/dashboard`, label: t(locale, "nav.dashboard") },
    {
      href: `${base}/expenses`,
      label: householdType === "RECURRING" ? t(locale, "nav.monthView") : t(locale, "nav.expensesTab"),
    },
    { href: `${base}/categories`, label: t(locale, "nav.categoriesTab") },
    ...(householdType === "RECURRING" ? [{ href: `${base}/recurring`, label: t(locale, "nav.recurringTab") }] : []),
    { href: `${base}/settle-up`, label: t(locale, "nav.settleUpTab") },
  ];

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 pb-2.5 pt-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/households"
              title={t(locale, "nav.allHouseholds")}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              ←
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-bold leading-[22px] tracking-tight text-slate-900">
                {householdName}
              </h1>
              <p className="text-xs leading-4 text-slate-400">
                {tPlural(locale, members.length, "households.memberOne", "households.memberOther")} · {currency}
              </p>
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Link
              href={`${base}/setup`}
              className="rounded-[10px] px-2.5 py-1.5 text-[13px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              {t(locale, "nav.manage")}
            </Link>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t(locale, "nav.addExpense")}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-0.5 overflow-x-auto px-5">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  "flex-none border-b-2 px-3 pb-2.5 pt-2 text-sm transition-colors",
                  active
                    ? "border-brand-600 font-semibold text-slate-900"
                    : "border-transparent font-medium text-slate-400 hover:text-slate-900"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {sheetOpen && (
        <QuickAddExpenseSheet
          householdId={householdId}
          members={members}
          categories={categories}
          currency={currency}
          locale={locale}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
