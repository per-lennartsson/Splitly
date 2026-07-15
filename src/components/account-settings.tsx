"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LOCALE_OPTIONS, type Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";

export function AccountSettings({ locale }: { locale: Locale }) {
  const router = useRouter();
  const { update } = useSession();
  const [selected, setSelected] = useState<Locale>(locale);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: selected }),
    });
    await update({ locale: selected });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-8">
      <Link href="/households" className="text-sm text-slate-500 hover:text-slate-700">
        {t(locale, "account.backToHouseholds")}
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold text-slate-900">{t(locale, "account.title")}</h1>

      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="locale">
            {t(locale, "account.language")}
          </label>
          <select
            id="locale"
            className="input"
            value={selected}
            onChange={(e) => setSelected(e.target.value as Locale)}
          >
            {LOCALE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saving ? "..." : saved ? t(locale, "account.saved") : t(locale, "account.save")}
        </button>
      </div>
    </div>
  );
}
