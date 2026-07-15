"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePreAuthLocale } from "@/lib/i18n/use-locale";
import { t } from "@/lib/i18n/t";
import { LocaleToggle } from "@/components/locale-toggle";

export default function SignupPage() {
  const router = useRouter();
  const [locale, setLocale] = usePreAuthLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, locale }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error?.formErrors?.[0] ?? data.error ?? t(locale, "auth.signup.genericError"));
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (signInRes?.error) {
      setError(t(locale, "auth.signup.loginFailedAfterSignup"));
      router.push("/login");
      return;
    }
    router.push("/households");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">{t(locale, "app.name")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t(locale, "auth.signup.title")}</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <div className="rounded-xl bg-negative-50 px-3 py-2 text-sm text-negative-700">
              {error}
            </div>
          )}
          <div>
            <label className="label" htmlFor="name">{t(locale, "auth.signup.name")}</label>
            <input
              id="name"
              required
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="email">{t(locale, "auth.signup.email")}</label>
            <input
              id="email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">{t(locale, "auth.signup.password")}</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">{t(locale, "auth.signup.passwordHint")}</p>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t(locale, "auth.signup.submitting") : t(locale, "auth.signup.submit")}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {t(locale, "auth.signup.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            {t(locale, "auth.signup.loginLink")}
          </Link>
        </p>
        <div className="mt-4">
          <LocaleToggle locale={locale} onChange={setLocale} />
        </div>
      </div>
    </div>
  );
}
