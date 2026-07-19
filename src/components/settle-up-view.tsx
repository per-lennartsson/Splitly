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

export function SettleUpView({
  householdId,
  currentUserId,
  currency,
  locale,
  netPositions,
  transactions,
}: {
  householdId: string;
  currentUserId: string;
  currency: CurrencyCode;
  locale: Locale;
  netPositions: NetPositionVM[];
  transactions: TransactionVM[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const money = (n: number) => formatMoney(n, currency, intlLocale(locale));

  const myPosition = netPositions.find((p) => p.userId === currentUserId);

  async function markSettled(tx: TransactionVM) {
    const key = `${tx.fromUserId}-${tx.toUserId}`;
    setBusyKey(key);
    setError(null);
    const res = await fetch(`/api/households/${householdId}/settlements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromUserId: tx.fromUserId,
        toUserId: tx.toUserId,
        amount: tx.amount,
        note: null,
      }),
    });
    setBusyKey(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t(locale, "settleUp.genericError"));
      return;
    }
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

      <div className="mb-6 space-y-2">
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

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{t(locale, "settleUp.suggestedPayments")}</p>
        {error && <p className="mb-2 text-sm text-negative-600">{error}</p>}
        {transactions.length === 0 ? (
          <p className="text-sm text-slate-400">{t(locale, "settleUp.allSettled")}</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const key = `${tx.fromUserId}-${tx.toUserId}`;
              return (
                <div key={key} className="card flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-900">{t(locale, "settleUp.pays", { from: tx.fromName, to: tx.toName })}</p>
                  <div className="flex flex-none items-center gap-3">
                    <span className="font-medium text-slate-900">{money(tx.amount)}</span>
                    <button
                      disabled={busyKey === key}
                      onClick={() => markSettled(tx)}
                      className="btn-secondary py-1.5"
                    >
                      {busyKey === key ? t(locale, "settleUp.saving") : t(locale, "settleUp.markSettled")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
