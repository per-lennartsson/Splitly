"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { Locale } from "@/lib/i18n/translations";
import { t, tPlural } from "@/lib/i18n/t";
import type { CurrencyCode } from "@/lib/currency";

export interface HouseholdSummary {
  id: string;
  name: string;
  householdType: "RECURRING" | "EVENT";
  currency: CurrencyCode;
  inviteCode: string;
  role: "ADMIN" | "MEMBER";
  memberCount: number;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function HouseholdCard({ household, locale }: { household: HouseholdSummary; locale: Locale }) {
  return (
    <Link
      href={`/households/${household.id}/dashboard`}
      className="card flex items-center gap-3 transition-shadow hover:shadow-md"
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
        {initials(household.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{household.name}</p>
        <p className="text-xs text-slate-500">
          {tPlural(locale, household.memberCount, "households.memberOne", "households.memberOther")}
          {household.role === "ADMIN" ? ` · ${t(locale, "households.admin")}` : ""}
        </p>
      </div>
    </Link>
  );
}

export function HouseholdSwitcher({
  households,
  userName,
  locale,
}: {
  households: HouseholdSummary[];
  userName: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joining, setJoining] = useState(false);

  const recurring = households.filter((h) => h.householdType === "RECURRING");
  const event = households.filter((h) => h.householdType === "EVENT");

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setJoinError(null);
    const res = await fetch("/api/households/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCode }),
    });
    setJoining(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setJoinError(data.error ?? t(locale, "joinHousehold.genericError"));
      return;
    }
    const data = await res.json();
    router.push(`/households/${data.household.id}/dashboard`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t(locale, "app.name")}</h1>
          <p className="text-sm text-slate-500">{t(locale, "households.greeting", { name: userName })}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/account" className="text-sm text-slate-500 hover:text-slate-700">
            {t(locale, "account.title")}
          </Link>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn-secondary">
            {t(locale, "households.logout")}
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/households/new" className="btn-primary">
          {t(locale, "households.newGroup")}
        </Link>
        <button onClick={() => setJoinOpen((v) => !v)} className="btn-secondary">
          {t(locale, "households.joinWithCode")}
        </button>
      </div>

      {joinOpen && (
        <form onSubmit={handleJoin} className="card mb-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="label" htmlFor="joinCode">{t(locale, "households.inviteCode")}</label>
            <input
              id="joinCode"
              className="input uppercase"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="ABC12345"
              required
            />
          </div>
          <button type="submit" disabled={joining} className="btn-primary">
            {joining ? t(locale, "households.joining") : t(locale, "households.join")}
          </button>
          {joinError && <p className="w-full text-sm text-negative-600">{joinError}</p>}
        </form>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t(locale, "households.recurringHouseholds")}
        </h2>
        {recurring.length === 0 ? (
          <p className="text-sm text-slate-400">{t(locale, "households.noRecurring")}</p>
        ) : (
          <div className="space-y-2">
            {recurring.map((h) => (
              <HouseholdCard key={h.id} household={h} locale={locale} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t(locale, "households.eventGroups")}
        </h2>
        {event.length === 0 ? (
          <p className="text-sm text-slate-400">{t(locale, "households.noEvent")}</p>
        ) : (
          <div className="space-y-2">
            {event.map((h) => (
              <HouseholdCard key={h.id} household={h} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
