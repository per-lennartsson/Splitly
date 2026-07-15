"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { currencySymbol, type CurrencyCode } from "@/lib/currency";
import { intlLocale, type Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";

export interface MemberOption {
  userId: string;
  name: string;
  defaultSplitPercent: number | null;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface RecurringFormInitial {
  id?: string;
  title: string;
  amount: number;
  categoryId: string | null;
  dayOfMonth: number;
  paidBy: string;
  splitType: "PERCENT" | "FIXED";
  startDate: string;
  endDate: string | null;
  active: boolean;
  overrides: { userId: string; percent: number | null; amountOwed: number | null }[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RecurringForm({
  householdId,
  members,
  categories,
  currency,
  locale,
  initial,
}: {
  householdId: string;
  members: MemberOption[];
  categories: CategoryOption[];
  currency: CurrencyCode;
  locale: Locale;
  initial?: RecurringFormInitial;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const symbol = currencySymbol(currency, intlLocale(locale));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth?.toString() ?? "1");
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? members[0]?.userId ?? "");
  const [splitType, setSplitType] = useState<"PERCENT" | "FIXED">(initial?.splitType ?? "PERCENT");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const overrideByUser = new Map((initial?.overrides ?? []).map((o) => [o.userId, o]));
  const [overrideOn, setOverrideOn] = useState<Set<string>>(
    new Set(
      splitType === "FIXED" && initial
        ? initial.overrides.map((o) => o.userId)
        : (initial?.overrides ?? []).filter((o) => o.percent !== null).map((o) => o.userId)
    )
  );
  const [overridePercent, setOverridePercent] = useState<Record<string, number>>(
    Object.fromEntries(members.map((m) => [m.userId, overrideByUser.get(m.userId)?.percent ?? m.defaultSplitPercent ?? 0]))
  );
  const [overrideFixed, setOverrideFixed] = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.userId, overrideByUser.get(m.userId)?.amountOwed?.toString() ?? ""]))
  );

  const amountNum = Number(amount) || 0;

  const effectivePercentTotal = useMemo(() => {
    return members.reduce((sum, m) => {
      const percent = overrideOn.has(m.userId) ? overridePercent[m.userId] ?? 0 : m.defaultSplitPercent ?? 0;
      return sum + percent;
    }, 0);
  }, [members, overrideOn, overridePercent]);

  const fixedTotal = useMemo(() => {
    return members
      .filter((m) => overrideOn.has(m.userId))
      .reduce((sum, m) => sum + (Number(overrideFixed[m.userId]) || 0), 0);
  }, [members, overrideOn, overrideFixed]);

  const percentOk = Math.abs(effectivePercentTotal - 100) < 0.01;
  const fixedOk = overrideOn.size > 0 && Math.abs(fixedTotal - amountNum) < 0.01;

  function toggleOverride(userId: string) {
    setOverrideOn((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (splitType === "PERCENT" && !percentOk) {
      setError(t(locale, "recurringForm.percentMustTotal"));
      return;
    }
    if (splitType === "FIXED" && !fixedOk) {
      setError(t(locale, "recurringForm.fixedMustTotal"));
      return;
    }

    const overrides =
      splitType === "PERCENT"
        ? members
            .filter((m) => overrideOn.has(m.userId))
            .map((m) => ({ userId: m.userId, percent: overridePercent[m.userId] ?? 0, amountOwed: null }))
        : members
            .filter((m) => overrideOn.has(m.userId))
            .map((m) => ({ userId: m.userId, percent: null, amountOwed: Number(overrideFixed[m.userId]) || 0 }));

    const payload = {
      title,
      amount: amountNum,
      categoryId: categoryId || null,
      dayOfMonth: Number(dayOfMonth),
      paidBy,
      splitType,
      startDate,
      endDate: endDate || null,
      active: initial?.active ?? true,
      overrides,
    };

    setSaving(true);
    const url = isEdit
      ? `/api/households/${householdId}/recurring/${initial!.id}`
      : `/api/households/${householdId}/recurring`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : t(locale, "recurringForm.genericError"));
      return;
    }

    router.push(`/households/${householdId}/recurring`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="label" htmlFor="title">{t(locale, "expenseForm.titleLabel")}</label>
        <input id="title" required className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="amount">{t(locale, "expenseForm.amountLabel")}</label>
          <input
            id="amount"
            type="number"
            min={0.01}
            step="0.01"
            required
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="dayOfMonth">{t(locale, "recurringForm.dayOfMonth")}</label>
          <input
            id="dayOfMonth"
            type="number"
            min={1}
            max={31}
            required
            className="input"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="category">{t(locale, "expenseForm.categoryLabel")}</label>
          <select id="category" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t(locale, "common.none")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="paidBy">{t(locale, "expenseForm.paidByLabel")}</label>
          <select id="paidBy" className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="startDate">{t(locale, "recurringForm.startDate")}</label>
          <input
            id="startDate"
            type="date"
            required
            className="input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="endDate">{t(locale, "recurringForm.endDateOptional")}</label>
          <input
            id="endDate"
            type="date"
            className="input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div>
        <p className="label">{t(locale, "expenseForm.splitLabel")}</p>
        <div className="mb-3 inline-flex rounded-xl border border-slate-300 p-1">
          {(["PERCENT", "FIXED"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSplitType(option)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                splitType === option ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {option === "PERCENT" ? t(locale, "expenseForm.percentOption") : t(locale, "expenseForm.fixedOption")}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-slate-500">
          {splitType === "PERCENT"
            ? t(locale, "recurringForm.usesDefaultHint")
            : t(locale, "recurringForm.fixedHint")}
        </p>

        <div className="space-y-2">
          {members.map((m) => {
            const isOverridden = overrideOn.has(m.userId);
            return (
              <div key={m.userId} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={isOverridden}
                  onChange={() => toggleOverride(m.userId)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <span className="flex-1 truncate text-sm text-slate-900">
                  {m.name}
                  {splitType === "PERCENT" && !isOverridden && (
                    <span className="ml-1 text-xs text-slate-400">
                      {t(locale, "recurringForm.defaultPercentSuffix", { percent: m.defaultSplitPercent ?? 0 })}
                    </span>
                  )}
                </span>
                {splitType === "PERCENT" ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      disabled={!isOverridden}
                      className="input w-20 text-right"
                      value={overridePercent[m.userId] ?? 0}
                      onChange={(e) =>
                        setOverridePercent((prev) => ({ ...prev, [m.userId]: Number(e.target.value) }))
                      }
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-slate-500">{symbol}</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={!isOverridden}
                      className="input w-24 text-right"
                      value={overrideFixed[m.userId] ?? ""}
                      onChange={(e) =>
                        setOverrideFixed((prev) => ({ ...prev, [m.userId]: e.target.value }))
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-slate-500">{t(locale, "householdSetup.total")}</span>
          {splitType === "PERCENT" ? (
            <span className={percentOk ? "text-positive-600" : "text-negative-600"}>
              {effectivePercentTotal.toFixed(2)}%
            </span>
          ) : (
            <span className={fixedOk ? "text-positive-600" : "text-negative-600"}>
              {symbol}
              {fixedTotal.toFixed(2)} / {symbol}
              {amountNum.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-negative-600">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full">
        {saving
          ? t(locale, "recurringForm.submitting")
          : isEdit
          ? t(locale, "recurringForm.submitEdit")
          : t(locale, "recurringForm.submitAdd")}
      </button>
    </form>
  );
}
