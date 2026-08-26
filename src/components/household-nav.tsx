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
  const [moreOpen, setMoreOpen] = useState(false);

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

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  const homeTab = tabs[0];
  const monthTab = tabs[1];
  const settleTab = tabs[tabs.length - 1];
  const overflowTabs = tabs.slice(2, tabs.length - 1);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        {/* Mobile: single-line collapsed header */}
        <div className="flex h-[52px] items-center gap-1 px-2 sm:hidden">
          <Link
            href="/households"
            title={t(locale, "nav.allHouseholds")}
            className="flex h-11 w-11 flex-none items-center justify-center text-slate-500"
          >
            ‹
          </Link>
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h1 className="truncate text-base font-bold leading-[22px] tracking-tight text-slate-900">
              {householdName}
            </h1>
            <span className="flex-none text-xs text-slate-400">
              {members.length} · {currency}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            title={t(locale, "nav.more")}
            className="flex h-11 w-11 flex-none items-center justify-center text-lg tracking-widest text-slate-500"
          >
            ···
          </button>
        </div>

        {/* Desktop: full header with Manage + Add expense */}
        <div className="mx-auto hidden max-w-3xl items-center justify-between gap-3 px-5 pb-2.5 pt-3.5 sm:flex">
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

        <nav className="mx-auto hidden max-w-3xl gap-0.5 overflow-x-auto px-5 sm:flex">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
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

      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3 shadow-2xl"
          >
            <div className="mb-3 flex justify-center">
              <div className="h-[5px] w-11 rounded-full bg-slate-200" />
            </div>
            <div className="flex flex-col">
              {overflowTabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMoreOpen(false)}
                  className={clsx(
                    "flex h-12 items-center rounded-xl px-3 text-[15px]",
                    isActive(tab.href) ? "font-semibold text-brand-800" : "font-medium text-slate-900"
                  )}
                >
                  {tab.label}
                </Link>
              ))}
              <Link
                href={`${base}/setup`}
                onClick={() => setMoreOpen(false)}
                className="flex h-12 items-center rounded-xl px-3 text-[15px] font-medium text-slate-900"
              >
                {t(locale, "nav.manage")}
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="btn-secondary mt-2 w-full"
            >
              {t(locale, "common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Mobile: fixed bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-slate-200 bg-white/95 px-1 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5 backdrop-blur sm:hidden">
        <Link
          href={homeTab.href}
          className={clsx(
            "mx-0.5 flex h-12 flex-1 items-center justify-center rounded-2xl text-[13px] font-medium",
            isActive(homeTab.href) ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-400"
          )}
        >
          {t(locale, "nav.homeTab")}
        </Link>
        <Link
          href={monthTab.href}
          className={clsx(
            "mx-0.5 flex h-12 flex-1 items-center justify-center rounded-2xl text-[13px] font-medium",
            isActive(monthTab.href) ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-400"
          )}
        >
          {t(locale, "nav.monthTab")}
        </Link>
        <Link
          href={settleTab.href}
          className={clsx(
            "mx-0.5 flex h-12 flex-1 items-center justify-center rounded-2xl text-[13px] font-medium",
            isActive(settleTab.href) ? "bg-brand-50 font-semibold text-brand-800" : "text-slate-400"
          )}
        >
          {t(locale, "nav.settleShort")}
        </Link>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="mx-0.5 flex h-12 flex-1 items-center justify-center rounded-2xl text-[13px] font-medium text-slate-400"
        >
          {t(locale, "nav.more")}
        </button>
      </nav>

      {/* Mobile: floating add-expense button */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        title={t(locale, "nav.addExpense")}
        className="fixed bottom-24 right-[18px] z-10 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand-600 text-3xl font-normal leading-none text-white shadow-lg shadow-brand-600/40 sm:hidden"
      >
        +
      </button>
    </>
  );
}
