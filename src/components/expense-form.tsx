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
  color: string;
}

export interface ExpenseFormInitial {
  id?: string;
  title: string;
  amount: number;
  categoryId: string | null;
  paidBy: string;
  date: string; // yyyy-mm-dd
  splitType: "PERCENT" | "FIXED";
  notes: string;
  splits: { userId: string; percent: number | null; amountOwed: number }[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function evenSplit<T>(members: MemberOption[], mapper: (m: MemberOption, share: number) => T): T[] {
  const n = members.length || 1;
  const base = 100 / n;
  return members.map((m) => mapper(m, base));
}

export function ExpenseForm({
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
  initial?: ExpenseFormInitial;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);
  const symbol = currencySymbol(currency, intlLocale(locale));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? members[0]?.userId ?? "");
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [splitType, setSplitType] = useState<"PERCENT" | "FIXED">(initial?.splitType ?? "PERCENT");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasDefaults = members.some((m) => m.defaultSplitPercent !== null);
  const initialIncluded = new Set(
    initial ? initial.splits.map((s) => s.userId) : members.map((m) => m.userId)
  );
  const [included, setIncluded] = useState<Set<string>>(initialIncluded);

  const [percents, setPercents] = useState<Record<string, number>>(() => {
    if (initial) {
      return Object.fromEntries(initial.splits.map((s) => [s.userId, s.percent ?? 0]));
    }
    if (hasDefaults) {
      return Object.fromEntries(members.map((m) => [m.userId, m.defaultSplitPercent ?? 0]));
    }
    return Object.fromEntries(evenSplit(members, (m, share) => [m.userId, Math.round(share * 100) / 100]));
  });

  const [fixedAmounts, setFixedAmounts] = useState<Record<string, string>>(() => {
    if (initial && initial.splitType === "FIXED") {
      return Object.fromEntries(initial.splits.map((s) => [s.userId, s.amountOwed.toString()]));
    }
    return Object.fromEntries(members.map((m) => [m.userId, ""]));
  });

  const activeMembers = members.filter((m) => included.has(m.userId));
  const percentTotal = useMemo(
    () => activeMembers.reduce((sum, m) => sum + (percents[m.userId] ?? 0), 0),
    [activeMembers, percents]
  );
  const fixedTotal = useMemo(
    () => activeMembers.reduce((sum, m) => sum + (Number(fixedAmounts[m.userId]) || 0), 0),
    [activeMembers, fixedAmounts]
  );
  const amountNum = Number(amount) || 0;
  const percentOk = Math.abs(percentTotal - 100) < 0.01;
  const fixedOk = Math.abs(fixedTotal - amountNum) < 0.01;

  function toggleMember(userId: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (activeMembers.length === 0) {
      setError(t(locale, "expenseForm.selectAtLeastOne"));
      return;
    }
    if (splitType === "PERCENT" && !percentOk) {
      setError(t(locale, "expenseForm.percentMustTotal"));
      return;
    }
    if (splitType === "FIXED" && !fixedOk) {
      setError(t(locale, "expenseForm.fixedMustTotal"));
      return;
    }

    const splits =
      splitType === "PERCENT"
        ? activeMembers.map((m) => ({ userId: m.userId, percent: percents[m.userId] ?? 0 }))
        : activeMembers.map((m) => ({ userId: m.userId, amountOwed: Number(fixedAmounts[m.userId]) || 0 }));

    const payload = {
      title,
      amount: amountNum,
      categoryId: categoryId || null,
      paidBy,
      date,
      splitType,
      notes: notes || null,
      splits,
    };

    setSaving(true);
    const url = isEdit
      ? `/api/households/${householdId}/expenses/${initial!.id}`
      : `/api/households/${householdId}/expenses`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : t(locale, "expenseForm.genericError"));
      return;
    }

    router.push(`/households/${householdId}/expenses`);
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
          <label className="label" htmlFor="date">{t(locale, "expenseForm.dateLabel")}</label>
          <input
            id="date"
            type="date"
            required
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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

        <div className="space-y-2">
          {members.map((m) => {
            const isIncluded = included.has(m.userId);
            return (
              <div
                key={m.userId}
                className={clsx(
                  "flex items-center gap-3 rounded-xl border px-3 py-2",
                  isIncluded ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  checked={isIncluded}
                  onChange={() => toggleMember(m.userId)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <span className="flex-1 truncate text-sm text-slate-900">{m.name}</span>
                {splitType === "PERCENT" ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      disabled={!isIncluded}
                      className="input w-20 text-right"
                      value={percents[m.userId] ?? 0}
                      onChange={(e) =>
                        setPercents((prev) => ({ ...prev, [m.userId]: Number(e.target.value) }))
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
                      disabled={!isIncluded}
                      className="input w-24 text-right"
                      value={fixedAmounts[m.userId] ?? ""}
                      onChange={(e) =>
                        setFixedAmounts((prev) => ({ ...prev, [m.userId]: e.target.value }))
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
              {percentTotal.toFixed(2)}%
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

      <div>
        <label className="label" htmlFor="notes">{t(locale, "expenseForm.notesLabel")}</label>
        <textarea
          id="notes"
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-negative-600">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary w-full">
        {saving
          ? t(locale, "expenseForm.submitting")
          : isEdit
          ? t(locale, "expenseForm.submitEdit")
          : t(locale, "expenseForm.submitAdd")}
      </button>
    </form>
  );
}
