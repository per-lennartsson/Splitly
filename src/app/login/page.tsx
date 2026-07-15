"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePreAuthLocale } from "@/lib/i18n/use-locale";
import { t } from "@/lib/i18n/t";
import { LocaleToggle } from "@/components/locale-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [locale, setLocale] = usePreAuthLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(t(locale, "auth.login.error"));
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
          <p className="mt-1 text-sm text-slate-500">{t(locale, "auth.login.title")}</p>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <div className="rounded-xl bg-negative-50 px-3 py-2 text-sm text-negative-700">
              {error}
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">{t(locale, "auth.login.email")}</label>
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
            <label className="label" htmlFor="password">{t(locale, "auth.login.password")}</label>
            <input
              id="password"
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t(locale, "auth.login.submitting") : t(locale, "auth.login.submit")}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {t(locale, "auth.login.noAccount")}{" "}
          <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">
            {t(locale, "auth.login.signupLink")}
          </Link>
        </p>
        <div className="mt-4">
          <LocaleToggle locale={locale} onChange={setLocale} />
        </div>
      </div>
    </div>
  );
}
