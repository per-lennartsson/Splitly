"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSessionLocale } from "@/lib/i18n/use-locale";
import { t } from "@/lib/i18n/t";

function JoinHouseholdForm() {
  const router = useRouter();
  const locale = useSessionLocale();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams?.get("code") ?? "";
  const [code, setCode] = useState(codeFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function join(inviteCode: string) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/households/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t(locale, "joinHousehold.genericError"));
      return;
    }
    const data = await res.json();
    router.push(`/households/${data.household.id}/dashboard`);
  }

  useEffect(() => {
    if (codeFromUrl) join(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  return (
    <div className="mx-auto max-w-sm px-4 py-8">
      <Link href="/households" className="text-sm text-slate-500 hover:text-slate-700">
        {t(locale, "common.back")}
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold text-slate-900">{t(locale, "joinHousehold.title")}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          join(code);
        }}
        className="card space-y-4"
      >
        <div>
          <label className="label" htmlFor="code">{t(locale, "joinHousehold.inviteCode")}</label>
          <input
            id="code"
            className="input uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-negative-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t(locale, "joinHousehold.submitting") : t(locale, "joinHousehold.submit")}
        </button>
      </form>
    </div>
  );
}

export default function JoinHouseholdPage() {
  return (
    <Suspense>
      <JoinHouseholdForm />
    </Suspense>
  );
}
