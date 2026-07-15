"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { intlLocale, type Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";

export interface RecurringVM {
  id: string;
  title: string;
  amount: number;
  categoryName: string | null;
  categoryColor: string | null;
  dayOfMonth: number;
  payerName: string;
  splitType: "PERCENT" | "FIXED";
  active: boolean;
  endDate: string | null;
  reviewDue: boolean;
}

export function RecurringList({
  householdId,
  currency,
  locale,
  items,
}: {
  householdId: string;
  currency: CurrencyCode;
  locale: Locale;
  items: RecurringVM[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, currency, intlLocale(locale));

  async function togglePause(id: string, active: boolean) {
    setBusyId(id);
    await fetch(`/api/households/${householdId}/recurring/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function remove(id: string, title: string) {
    if (!confirm(t(locale, "recurringList.removeConfirm", { title }))) return;
    setBusyId(id);
    await fetch(`/api/households/${householdId}/recurring/${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  async function confirmStillAccurate(id: string) {
    setBusyId(id);
    await fetch(`/api/households/${householdId}/recurring/${id}/confirm`, { method: "POST" });
    setBusyId(null);
    router.refresh();
  }

  const reviewDueCount = items.filter((r) => r.reviewDue).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t(locale, "recurringList.title")}</h2>
        <Link href={`/households/${householdId}/recurring/new`} className="btn-primary">
          {t(locale, "recurringList.add")}
        </Link>
      </div>

      {reviewDueCount > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t(locale, "recurringList.reviewBanner", { count: reviewDueCount })}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{t(locale, "recurringList.none")}</p>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {r.categoryColor && (
                      <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: r.categoryColor }} />
                    )}
                    <p className="truncate font-medium text-slate-900">{r.title}</p>
                    {!r.active && <span className="badge-scheduled">{t(locale, "recurringList.paused")}</span>}
                    {r.reviewDue && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {t(locale, "recurringList.reviewBadge")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {t(locale, "recurringList.summary", {
                      amount: money(r.amount),
                      day: r.dayOfMonth,
                      name: r.payerName,
                    })}
                    {r.categoryName ? ` · ${r.categoryName}` : ""}
                  </p>
                  {r.endDate && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t(locale, "recurringList.endsOn", { date: r.endDate })}
                    </p>
                  )}
                  {r.reviewDue && (
                    <p className="mt-1 text-xs text-amber-700">
                      {t(locale, "recurringList.reviewPrompt")}{" "}
                      <button
                        disabled={busyId === r.id}
                        onClick={() => confirmStillAccurate(r.id)}
                        className="font-medium underline hover:text-amber-900"
                      >
                        {t(locale, "recurringList.reviewConfirm")}
                      </button>
                    </p>
                  )}
                </div>
                <div className="flex flex-none flex-col items-end gap-1 text-sm">
                  <Link href={`/households/${householdId}/recurring/${r.id}/edit`} className="text-brand-600 hover:text-brand-700">
                    {t(locale, "common.edit")}
                  </Link>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => togglePause(r.id, r.active)}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    {r.active ? t(locale, "recurringList.pause") : t(locale, "recurringList.resume")}
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => remove(r.id, r.title)}
                    className="text-negative-600 hover:text-negative-700"
                  >
                    {t(locale, "recurringList.remove")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
