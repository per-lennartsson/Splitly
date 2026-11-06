"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";

export function GuestPicker({
  householdId,
  householdName,
  guests,
  locale,
}: {
  householdId: string;
  householdName: string;
  guests: { userId: string; name: string }[];
  locale: Locale;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ userId: string; name: string } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dashboard = `/households/${householdId}/dashboard`;

  async function handleConfirm() {
    if (!selected) return;
    setClaiming(true);
    setError(null);
    const res = await fetch(`/api/households/${householdId}/members/${selected.userId}/claim-self`, {
      method: "POST",
    });
    if (!res.ok) {
      setClaiming(false);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : t(locale, "guestPicker.genericError"));
      return;
    }
    router.push(dashboard);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">{t(locale, "guestPicker.title")}</h1>
      <p className="mb-6 text-sm text-slate-500">{t(locale, "guestPicker.desc", { group: householdName })}</p>

      <div className="card space-y-3">
        {selected ? (
          <>
            <p className="text-sm text-slate-700">{t(locale, "guestPicker.confirmText", { guest: selected.name })}</p>
            {error && <div className="rounded-xl bg-negative-50 px-3 py-2 text-sm text-negative-700">{error}</div>}
            <button onClick={handleConfirm} disabled={claiming} className="btn-primary w-full">
              {claiming
                ? t(locale, "guestPicker.claiming")
                : t(locale, "guestPicker.confirmButton", { guest: selected.name })}
            </button>
            <button
              onClick={() => {
                setSelected(null);
                setError(null);
              }}
              disabled={claiming}
              className="btn-secondary w-full"
            >
              {t(locale, "common.back")}
            </button>
          </>
        ) : (
          <>
            {guests.map((g) => (
              <button
                key={g.userId}
                onClick={() => setSelected(g)}
                className="btn-secondary flex w-full items-center justify-between"
              >
                <span className="truncate">{g.name}</span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  {t(locale, "common.guestBadge")}
                </span>
              </button>
            ))}
            <Link href={dashboard} className="block pt-2 text-center text-sm text-slate-500 hover:text-slate-700">
              {t(locale, "guestPicker.noneOfThese")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
