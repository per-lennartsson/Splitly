"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import clsx from "clsx";
import { currencySymbol, formatMoney, type CurrencyCode } from "@/lib/currency";
import { intlLocale, type Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";

export interface QuickAddMember {
  userId: string;
  name: string;
  isPlaceholder?: boolean;
}

export interface QuickAddCategory {
  id: string;
  name: string;
  color: string;
}

const AVATAR_PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function QuickAddExpenseSheet({
  householdId,
  members,
  categories,
  currency,
  locale,
  onClose,
}: {
  householdId: string;
  members: QuickAddMember[];
  categories: QuickAddCategory[];
  currency: CurrencyCode;
  locale: Locale;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const symbol = currencySymbol(currency, intlLocale(locale));

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState(
    () => members.find((m) => m.userId === session?.user?.id)?.userId ?? members[0]?.userId ?? ""
  );
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount.replace(",", ".")) || 0;
  const shareCount = members.length || 1;
  const share = amountNum > 0 ? formatMoney(amountNum / shareCount, currency, intlLocale(locale)) : "—";

  function stopClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || amountNum <= 0 || !payer) {
      setError(t(locale, "expenseForm.genericError"));
      return;
    }

    const evenPercent = 100 / shareCount;
    const payload = {
      title: title.trim(),
      amount: amountNum,
      categoryId,
      paidBy: payer,
      date,
      splitType: "PERCENT" as const,
      notes: null,
      splits: members.map((m) => ({ userId: m.userId, percent: evenPercent })),
    };

    setSaving(true);
    const res = await fetch(`/api/households/${householdId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : t(locale, "expenseForm.genericError"));
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40"
    >
      <div
        onClick={stopClick}
        className="w-full max-w-lg rounded-t-3xl bg-white px-6 pb-7 pt-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{t(locale, "quickAdd.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="grid grid-cols-[1fr_140px] gap-2.5">
            <input
              autoFocus
              required
              placeholder={t(locale, "quickAdd.titlePlaceholder")}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              required
              inputMode="decimal"
              placeholder={`0 ${symbol}`}
              className="input text-right tabular-nums"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t(locale, "quickAdd.paidBy")}
            </p>
            <div className="flex flex-wrap gap-2">
              {members.map((m, i) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setPayer(m.userId)}
                  className={clsx("pill py-1 pl-1.5 pr-3.5", payer === m.userId ? "pill-active" : "pill-inactive")}
                >
                  <span
                    className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
                  >
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  {m.name}
                  {m.isPlaceholder && (
                    <span className="text-[10px] font-normal text-slate-400">
                      ({t(locale, "common.guestBadge")})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {categories.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t(locale, "quickAdd.category")}
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId((prev) => (prev === c.id ? null : c.id))}
                    className={clsx("pill", categoryId === c.id ? "pill-active" : "pill-inactive")}
                  >
                    <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f4f5f7] px-4 py-3">
            <p className="text-sm text-slate-500">{t(locale, "quickAdd.splitSummary", { share })}</p>
            <a
              href={`/households/${householdId}/expenses/new`}
              className="flex-none text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              {t(locale, "quickAdd.customize")}
            </a>
          </div>

          {error && <p className="text-sm text-negative-600">{error}</p>}

          <div className="grid grid-cols-[140px_1fr] gap-2.5">
            <input type="date" required className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? t(locale, "expenseForm.submitting") : t(locale, "expenseForm.submitAdd")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
