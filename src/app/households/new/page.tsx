"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { useSessionLocale } from "@/lib/i18n/use-locale";
import { t } from "@/lib/i18n/t";
import { CURRENCY_OPTIONS, type CurrencyCode } from "@/lib/currency";

type HouseholdType = "RECURRING" | "EVENT";

export default function NewHouseholdPage() {
  const router = useRouter();
  const locale = useSessionLocale();
  const [type, setType] = useState<HouseholdType | null>(null);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/households", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, householdType: type, currency }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error?.formErrors?.[0] ?? t(locale, "newHousehold.genericError"));
      return;
    }
    const data = await res.json();
    router.push(`/households/${data.household.id}/setup`);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/households" className="text-sm text-slate-500 hover:text-slate-700">
        {t(locale, "common.back")}
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold text-slate-900">{t(locale, "newHousehold.title")}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <p className="label">{t(locale, "newHousehold.kindQuestion")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setType("RECURRING")}
              className={clsx(
                "card text-left transition-shadow",
                type === "RECURRING" ? "border-brand-500 ring-2 ring-brand-100" : "hover:shadow-md"
              )}
            >
              <p className="font-medium text-slate-900">{t(locale, "newHousehold.recurringTitle")}</p>
              <p className="mt-1 text-sm text-slate-500">{t(locale, "newHousehold.recurringDesc")}</p>
            </button>
            <button
              type="button"
              onClick={() => setType("EVENT")}
              className={clsx(
                "card text-left transition-shadow",
                type === "EVENT" ? "border-brand-500 ring-2 ring-brand-100" : "hover:shadow-md"
              )}
            >
              <p className="font-medium text-slate-900">{t(locale, "newHousehold.eventTitle")}</p>
              <p className="mt-1 text-sm text-slate-500">{t(locale, "newHousehold.eventDesc")}</p>
            </button>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="name">{t(locale, "newHousehold.nameLabel")}</label>
          <input
            id="name"
            required
            className="input"
            placeholder={
              type === "EVENT"
                ? t(locale, "newHousehold.namePlaceholderEvent")
                : t(locale, "newHousehold.namePlaceholderRecurring")
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="currency">{t(locale, "newHousehold.currencyLabel")}</label>
          <select
            id="currency"
            className="input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          >
            {CURRENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-negative-600">{error}</p>}

        <button type="submit" disabled={!type || !name || loading} className="btn-primary w-full">
          {loading ? t(locale, "newHousehold.submitting") : t(locale, "newHousehold.submit")}
        </button>
      </form>
    </div>
  );
}
