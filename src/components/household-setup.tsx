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
  isPlaceholder: boolean;
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
  const [localMembers, setLocalMembers] = useState<Member[]>(members);
  const [guestName, setGuestName] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

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

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) return;
    setAddingGuest(true);
    setGuestError(null);
    const res = await fetch(`/api/households/${household.id}/members/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: guestName.trim() }),
    });
    setAddingGuest(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setGuestError(typeof data.error === "string" ? data.error : t(locale, "householdSetup.addGuestError"));
      return;
    }
    const data = await res.json();
    setLocalMembers((prev) => [
      ...prev,
      {
        userId: data.member.userId,
        name: data.member.name,
        email: data.member.email,
        role: "MEMBER" as const,
        isPlaceholder: true,
        defaultSplitPercent: 0,
      },
    ]);
    setGuestName("");
    router.refresh();
  }

  async function handleRemoveGuest(userId: string) {
    setRemovingUserId(userId);
    const res = await fetch(`/api/households/${household.id}/members/${userId}`, { method: "DELETE" });
    setRemovingUserId(null);
    if (res.ok) {
      setLocalMembers((prev) => prev.filter((m) => m.userId !== userId));
      router.refresh();
    }
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

      {household.householdType === "EVENT" && (
        <div className="card mb-6">
          <p className="label">{t(locale, "householdSetup.guestsTitle")}</p>
          <p className="mb-3 text-sm text-slate-500">{t(locale, "householdSetup.guestsDesc")}</p>
          <div className="space-y-3">
            {localMembers.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.name}{" "}
                    {m.isPlaceholder && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {t(locale, "common.guestBadge")}
                      </span>
                    )}{" "}
                    {m.userId === currentUserId && (
                      <span className="text-slate-400">{t(locale, "householdSetup.you")}</span>
                    )}
                  </p>
                  {!m.isPlaceholder && <p className="truncate text-xs text-slate-400">{m.email}</p>}
                </div>
                {m.isPlaceholder && currentUserIsAdmin && (
                  <button
                    onClick={() => handleRemoveGuest(m.userId)}
                    disabled={removingUserId === m.userId}
                    className="flex-none text-xs font-medium text-negative-600 hover:text-negative-700"
                  >
                    {t(locale, "householdSetup.removeGuest")}
                  </button>
                )}
              </div>
            ))}
          </div>

          {currentUserIsAdmin && (
            <form onSubmit={handleAddGuest} className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
              <input
                type="text"
                placeholder={t(locale, "householdSetup.guestNamePlaceholder")}
                className="input flex-1"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                maxLength={100}
              />
              <button
                type="submit"
                disabled={addingGuest || !guestName.trim()}
                className="btn-secondary flex-none"
              >
                {addingGuest ? t(locale, "householdSetup.addingGuest") : t(locale, "householdSetup.addGuestButton")}
              </button>
            </form>
          )}
          {guestError && <p className="mt-2 text-sm text-negative-600">{guestError}</p>}
        </div>
      )}

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
