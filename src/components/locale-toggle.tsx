"use client";

import clsx from "clsx";
import { LOCALE_OPTIONS, type Locale } from "@/lib/i18n/translations";

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  return (
    <div className="flex justify-center gap-1 text-sm">
      {LOCALE_OPTIONS.map((opt, i) => (
        <span key={opt.value} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300">|</span>}
          <button
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              "rounded px-1.5 py-0.5",
              locale === opt.value ? "font-medium text-brand-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            {opt.label}
          </button>
        </span>
      ))}
    </div>
  );
}
