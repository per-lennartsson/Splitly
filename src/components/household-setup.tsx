"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  defaultSplitPercent: number;
}

export function HouseholdSetup({
  household,
  members,
  currentUserId,
  locale,
}: {
  household: { id: string; name: string; householdType: "RECURRING" | "EVENT"; inviteCode: string };
  members: Member[];
  currentUserId: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [percents, setPercents] = useState<Record<string, number>>(
    Object.fromEntries(members.map((m) => [m.userId, m.defaultSplitPercent]))
  );
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => Object.values(percents).reduce((sum, p) => sum + (Number.isFinite(p) ? p : 0), 0),
    [percents]
  );
  const totalOk = Math.abs(total - 100) < 0.01;
  const currentUserIsAdmin = members.find((m) => m.userId === currentUserId)?.role === "ADMIN";

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/households/join?code=${household.inviteCode}`
      : "";

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteLink || household.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleSaveSplits() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/households/${household.id}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: Object.entries(percents).map(([userId, defaultSplitPercent]) => ({
          userId,
          defaultSplitPercent,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t(locale, "householdSetup.genericError"));
      return;
    }
    router.push(`/households/${household.id}/dashboard`);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/households" className="text-sm text-slate-500 hover:text-slate-700">
        {t(locale, "common.back")}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold text-slate-900">{household.name}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {household.householdType === "RECURRING"
          ? t(locale, "householdSetup.setupTitleRecurring")
          : t(locale, "householdSetup.setupTitleEvent")}
      </p>

      <div className="card mb-6">
        <p className="label">{t(locale, "householdSetup.invitePeopleTitle")}</p>
        <p className="mb-3 text-sm text-slate-500">{t(locale, "householdSetup.invitePeopleDesc")}</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-mono text-slate-700">
            {household.inviteCode}
          </code>
          <button onClick={handleCopy} className="btn-secondary">
            {copied ? t(locale, "householdSetup.copied") : t(locale, "householdSetup.copyLink")}
          </button>
        </div>
      </div>

      {household.householdType === "RECURRING" && (
        <div className="card mb-6">
          <p className="label">{t(locale, "householdSetup.defaultSplitsTitle")}</p>
          <p className="mb-3 text-sm text-slate-500">{t(locale, "householdSetup.defaultSplitsDesc")}</p>
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.name}{" "}
                    {m.userId === currentUserId && (
                      <span className="text-slate-400">{t(locale, "householdSetup.you")}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-400">{m.email}</p>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    disabled={!currentUserIsAdmin}
                    className="input w-24 text-right"
                    value={percents[m.userId]}
                    onChange={(e) =>
                      setPercents((prev) => ({ ...prev, [m.userId]: Number(e.target.value) }))
                    }
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">{t(locale, "householdSetup.total")}</span>
            <span className={totalOk ? "text-sm font-medium text-positive-600" : "text-sm font-medium text-negative-600"}>
              {total.toFixed(2)}%
            </span>
          </div>
          {error && <p className="mt-2 text-sm text-negative-600">{error}</p>}
          {currentUserIsAdmin ? (
            <button
              onClick={handleSaveSplits}
              disabled={!totalOk || saving}
              className="btn-primary mt-4 w-full"
            >
              {saving ? t(locale, "householdSetup.saving") : t(locale, "householdSetup.saveContinue")}
            </button>
          ) : (
            <p className="mt-4 text-xs text-slate-400">{t(locale, "householdSetup.adminOnlyNote")}</p>
          )}
        </div>
      )}

      <Link href={`/households/${household.id}/dashboard`} className="btn-secondary w-full text-center">
        {household.householdType === "RECURRING"
          ? t(locale, "householdSetup.skipForNow")
          : t(locale, "householdSetup.goToGroup")}
      </Link>
    </div>
  );
}
