"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/translations";
import { usePreAuthLocale } from "@/lib/i18n/use-locale";
import { t } from "@/lib/i18n/t";

export function GuestClaimCard({
  token,
  preview,
  errorCode,
  sessionUser,
}: {
  token: string;
  preview: { guestName: string; householdName: string } | null;
  errorCode: "INVALID" | "EXPIRED" | null;
  sessionUser: { email: string; locale: Locale } | null;
}) {
  const router = useRouter();
  const [preAuthLocale] = usePreAuthLocale();
  const locale = sessionUser?.locale ?? preAuthLocale;
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = encodeURIComponent(`/claim/${token}`);

  async function handleClaim() {
    setClaiming(true);
    setError(null);
    const res = await fetch(`/api/claim/${token}`, { method: "POST" });
    if (!res.ok) {
      setClaiming(false);
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : t(locale, "guestClaim.genericError"));
      return;
    }
    const data = await res.json();
    router.push(`/households/${data.householdId}/dashboard`);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">{t(locale, "app.name")}</h1>
        </div>
        <div className="card space-y-4">
          {!preview ? (
            <>
              <p className="text-sm text-slate-700">
                {errorCode === "EXPIRED" ? t(locale, "guestClaim.expired") : t(locale, "guestClaim.invalid")}
              </p>
              <Link href="/households" className="btn-secondary w-full text-center">
                {t(locale, "guestClaim.goToHouseholds")}
              </Link>
            </>
          ) : (
            <>
              <p className="text-base text-slate-900">
                {t(locale, "guestClaim.intro", { guest: preview.guestName, group: preview.householdName })}
              </p>
              <p className="text-sm text-slate-500">{t(locale, "guestClaim.explain", { guest: preview.guestName })}</p>
              {error && (
                <div className="rounded-xl bg-negative-50 px-3 py-2 text-sm text-negative-700">{error}</div>
              )}
              {sessionUser ? (
                <>
                  <button onClick={handleClaim} disabled={claiming} className="btn-primary w-full">
                    {claiming ? t(locale, "guestClaim.claiming") : t(locale, "guestClaim.claimButton")}
                  </button>
                  <p className="text-center text-xs text-slate-400">
                    {t(locale, "guestClaim.signedInAs", { email: sessionUser.email })}
                  </p>
                </>
              ) : (
                <>
                  <Link
                    href={`/signup?next=${next}&name=${encodeURIComponent(preview.guestName)}`}
                    className="btn-primary block w-full text-center"
                  >
                    {t(locale, "guestClaim.signupButton")}
                  </Link>
                  <Link href={`/login?next=${next}`} className="btn-secondary block w-full text-center">
                    {t(locale, "guestClaim.loginButton")}
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
