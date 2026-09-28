"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { intlLocale, type Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";

interface NetPositionVM {
  userId: string;
  name: string;
  isPlaceholder?: boolean;
  netBalance: number;
}

interface TransactionVM {
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  amount: number;
}

interface OpenShareVM {
  expenseId: string;
  debtorId: string;
  creditorId: string;
  title: string;
  owed: number;
  remaining: number;
}

interface SettlementHistoryVM {
  id: string;
  fromName: string;
  toName: string;
  amount: number;
  date: string;
  expenseTitles: string[];
}

function txKey(tx: { fromUserId: string; toUserId: string }) {
  return `${tx.fromUserId}-${tx.toUserId}`;
}

const AVATAR_PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"];

export function SettleUpView({
  householdId,
  currentUserId,
  currency,
  locale,
  netPositions,
  transactions,
  openShares,
  settlementHistory,
}: {
  householdId: string;
  currentUserId: string;
  currency: CurrencyCode;
  locale: Locale;
  netPositions: NetPositionVM[];
  transactions: TransactionVM[];
  openShares: OpenShareVM[];
  settlementHistory: SettlementHistoryVM[];
}) {
  const router = useRouter();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"balances" | "history" | null>(null);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [selectedExpenses, setSelectedExpenses] = useState<Record<string, Set<string>>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, currency, intlLocale(locale));

  const myPosition = netPositions.find((p) => p.userId === currentUserId);

  // Expense shares fromUser still owes toUser, oldest first — what's left after
  // earlier payments — so the user can pick which ones this payment covers.
  function coveringExpenses(tx: TransactionVM) {
    return openShares.filter((s) => s.debtorId === tx.fromUserId && s.creditorId === tx.toUserId);
  }

  function openPanel(tx: TransactionVM) {
    const key = txKey(tx);
    setExpandedKey(key);
    // Always start fresh (not from a stale draft left by a prior, already-submitted
    // payment on this same pair) — both the suggested amount and the covering
    // expenses list can have changed since the last time this panel was open.
    setAmountDrafts((prev) => ({ ...prev, [key]: tx.amount.toFixed(2) }));
    setSelectedExpenses((prev) => ({ ...prev, [key]: new Set() }));
    setError(null);
  }

  function toggleExpense(tx: TransactionVM, expenseId: string) {
    const key = txKey(tx);
    setSelectedExpenses((prev) => {
      const current = new Set(prev[key] ?? []);
      if (current.has(expenseId)) {
        current.delete(expenseId);
      } else {
        current.add(expenseId);
      }

      const sumCents = coveringExpenses(tx)
        .filter((e) => current.has(e.expenseId))
        .reduce((acc, e) => acc + Math.round(e.remaining * 100), 0);
      if (sumCents > 0) {
        setAmountDrafts((drafts) => ({ ...drafts, [key]: (sumCents / 100).toFixed(2) }));
      }

      return { ...prev, [key]: current };
    });
  }

  async function submitPayment(tx: TransactionVM) {
    const key = txKey(tx);
    const amount = Number(amountDrafts[key] ?? tx.amount.toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t(locale, "settleUp.invalidAmount"));
      return;
    }

    setBusyKey(key);
    setError(null);
    const res = await fetch(`/api/households/${householdId}/settlements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromUserId: tx.fromUserId,
        toUserId: tx.toUserId,
        amount,
        note: null,
        expenseIds: Array.from(selectedExpenses[key] ?? []),
      }),
    });
    setBusyKey(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t(locale, "settleUp.genericError"));
      return;
    }
    setExpandedKey(null);
    router.refresh();
  }

  return (
    <div>
      <h2 className="mb-6 text-lg font-semibold text-slate-900">{t(locale, "settleUp.title")}</h2>

      {myPosition && (
        <div className="card mb-6">
          <p className="text-sm text-slate-500">{t(locale, "settleUp.yourBalance")}</p>
          <p
            className={clsx(
              "mt-1 text-3xl font-semibold",
              myPosition.netBalance > 0 && "balance-positive",
              myPosition.netBalance < 0 && "balance-negative",
              myPosition.netBalance === 0 && "text-slate-900"
            )}
          >
            {myPosition.netBalance > 0 && "+"}
            {money(Math.abs(myPosition.netBalance))}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {myPosition.netBalance > 0
              ? t(locale, "settleUp.owedMoney")
              : myPosition.netBalance < 0
              ? t(locale, "settleUp.oweMoney")
              : t(locale, "settleUp.settled")}
          </p>
        </div>
      )}

      {/* Desktop: full inline balance list. Mobile: collapsed row that opens a sheet. */}
      <div className="mb-6 hidden space-y-2 sm:block">
        <p className="text-sm font-medium text-slate-700">{t(locale, "settleUp.everyonesBalance")}</p>
        {netPositions.map((p) => (
          <div key={p.userId} className="card flex items-center justify-between py-3">
            <span className="text-sm text-slate-900">
              {p.name}{" "}
              {p.isPlaceholder && <span className="text-xs text-slate-400">({t(locale, "common.guestBadge")})</span>}{" "}
              {p.userId === currentUserId && <span className="text-slate-400">{t(locale, "settleUp.you")}</span>}
            </span>
            <span
              className={clsx(
                "font-medium",
                p.netBalance > 0 && "balance-positive",
                p.netBalance < 0 && "balance-negative",
                p.netBalance === 0 && "text-slate-400"
              )}
            >
              {p.netBalance > 0 && "+"}
              {money(Math.abs(p.netBalance))}
            </span>
          </div>
        ))}
      </div>

      <div className="mb-6 space-y-2 sm:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel("balances")}
          className="card flex w-full items-center justify-between py-3.5 text-left"
        >
          <span className="text-[15px] font-medium text-slate-700">{t(locale, "settleUp.everyonesBalance")}</span>
          <span className="flex items-center gap-1.5">
            {netPositions.slice(0, 4).map((p, i) => (
              <span
                key={p.userId}
                className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            <span className="ml-0.5 text-lg text-slate-300">›</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("history")}
          className="card flex w-full items-center justify-between py-3.5 text-left"
        >
          <span className="text-[15px] font-medium text-slate-700">{t(locale, "settleUp.history")}</span>
          <span className="flex items-center gap-2">
            <span className="text-sm text-slate-400">{settlementHistory.length}</span>
            <span className="text-lg text-slate-300">›</span>
          </span>
        </button>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{t(locale, "settleUp.suggestedPayments")}</p>
        {error && <p className="mb-2 text-sm text-negative-600">{error}</p>}
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-400">{t(locale, "settleUp.allSettled")}</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const key = txKey(tx);
              const isOpen = expandedKey === key;
              const covering = coveringExpenses(tx);
              const selected = selectedExpenses[key] ?? new Set<string>();

              return (
                <div key={key} className="card">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="flex items-center justify-between gap-3 sm:flex-1">
                      <p className="text-sm text-slate-900">{t(locale, "settleUp.pays", { from: tx.fromName, to: tx.toName })}</p>
                      <span className="flex-none font-medium text-slate-900">{money(tx.amount)}</span>
                    </div>
                    {!isOpen && (
                      <button
                        onClick={() => openPanel(tx)}
                        className="btn-secondary w-full py-2.5 sm:w-auto sm:flex-none sm:py-1.5"
                      >
                        {t(locale, "settleUp.markSettled")}
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                      <div>
                        <label className="label" htmlFor={`amount-${key}`}>
                          {t(locale, "settleUp.amountLabel")}
                        </label>
                        <input
                          id={`amount-${key}`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="input"
                          value={amountDrafts[key] ?? tx.amount.toFixed(2)}
                          onChange={(e) => setAmountDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </div>

                      {covering.length > 0 && (
                        <div>
                          <p className="label mb-1.5">{t(locale, "settleUp.selectExpenses")}</p>
                          <div className="max-h-48 space-y-1.5 overflow-y-auto">
                            {covering.map((share) => (
                              <label key={share.expenseId} className="flex cursor-pointer items-center justify-between gap-2 text-sm text-slate-700">
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(share.expenseId)}
                                    onChange={() => toggleExpense(tx, share.expenseId)}
                                  />
                                  {share.title}
                                </span>
                                <span className="text-right text-slate-500">
                                  {money(share.remaining)}
                                  {share.remaining < share.owed && (
                                    <span className="block text-xs text-slate-400">
                                      {t(locale, "settleUp.partlyPaid", { remaining: money(share.remaining), owed: money(share.owed) })}
                                    </span>
                                  )}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button disabled={busyKey === key} onClick={() => submitPayment(tx)} className="btn-primary py-1.5">
                          {busyKey === key ? t(locale, "settleUp.saving") : t(locale, "settleUp.confirmPayment")}
                        </button>
                        <button onClick={() => setExpandedKey(null)} className="btn-secondary py-1.5">
                          {t(locale, "settleUp.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 hidden sm:block">
        <p className="mb-2 text-sm font-medium text-slate-700">{t(locale, "settleUp.history")}</p>
        {settlementHistory.length === 0 ? (
          <p className="text-sm text-slate-400">{t(locale, "settleUp.noHistory")}</p>
        ) : (
          <div className="space-y-2">
            {settlementHistory.map((s) => (
              <div key={s.id} className="card py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-900">{t(locale, "settleUp.paid", { from: s.fromName, to: s.toName })}</p>
                  <div className="flex flex-none items-center gap-3">
                    <span className="font-medium text-slate-900">{money(s.amount)}</span>
                    <span className="text-xs text-slate-400">{s.date}</span>
                  </div>
                </div>
                {s.expenseTitles.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {t(locale, "settleUp.forExpenses", { items: s.expenseTitles.join(", ") })}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {mobilePanel && (
        <div
          onClick={() => setMobilePanel(null)}
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 sm:hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl"
          >
            <div className="flex flex-none items-center justify-between px-6 pb-3 pt-6">
              <h3 className="text-lg font-bold text-slate-900">
                {t(locale, mobilePanel === "balances" ? "settleUp.everyonesBalance" : "settleUp.history")}
              </h3>
              <button
                type="button"
                onClick={() => setMobilePanel(null)}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                ×
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+20px)]">
              {mobilePanel === "balances"
                ? netPositions.map((p) => (
                    <div key={p.userId} className="card flex items-center justify-between py-3">
                      <span className="text-sm text-slate-900">
                        {p.name}{" "}
                        {p.isPlaceholder && (
                          <span className="text-xs text-slate-400">({t(locale, "common.guestBadge")})</span>
                        )}{" "}
                        {p.userId === currentUserId && <span className="text-slate-400">{t(locale, "settleUp.you")}</span>}
                      </span>
                      <span
                        className={clsx(
                          "font-medium",
                          p.netBalance > 0 && "balance-positive",
                          p.netBalance < 0 && "balance-negative",
                          p.netBalance === 0 && "text-slate-400"
                        )}
                      >
                        {p.netBalance > 0 && "+"}
                        {money(Math.abs(p.netBalance))}
                      </span>
                    </div>
                  ))
                : settlementHistory.length === 0 ? (
                    <p className="py-4 text-sm text-slate-400">{t(locale, "settleUp.noHistory")}</p>
                  ) : (
                    settlementHistory.map((s) => (
                      <div key={s.id} className="card py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm text-slate-900">{t(locale, "settleUp.paid", { from: s.fromName, to: s.toName })}</p>
                          <div className="flex flex-none items-center gap-3">
                            <span className="font-medium text-slate-900">{money(s.amount)}</span>
                            <span className="text-xs text-slate-400">{s.date}</span>
                          </div>
                        </div>
                        {s.expenseTitles.length > 0 && (
                          <p className="mt-1 text-xs text-slate-500">
                            {t(locale, "settleUp.forExpenses", { items: s.expenseTitles.join(", ") })}
                          </p>
                        )}
                      </div>
                    ))
                  )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
