"use client";

import Link from "next/link";
import clsx from "clsx";
import { t } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/translations";

function tint(hex: string): string {
  return `${hex}1f`;
}

function abbreviate(label: string): string {
  return label.trim().slice(0, 2).toUpperCase();
}

export function ExpenseRow({
  title,
  meta,
  amount,
  categoryName,
  categoryColor,
  projected = false,
  editHref,
  onDelete,
  deleteBusy = false,
  locale,
}: {
  title: string;
  meta: string;
  amount: string;
  categoryName: string | null;
  categoryColor: string | null;
  projected?: boolean;
  editHref?: string;
  onDelete?: () => void;
  deleteBusy?: boolean;
  locale: Locale;
}) {
  const color = categoryColor ?? "#8a909b";
  const abbr = abbreviate(categoryName ?? title);
  const showActions = !projected && (editHref || onDelete);

  return (
    <div className="flex items-center gap-3 px-6 py-2.5 hover:bg-slate-50">
      <span
        className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl text-xs font-bold"
        style={{ backgroundColor: tint(color), color, opacity: projected ? 0.7 : 1 }}
      >
        {abbr}
      </span>
      <div className="min-w-0 flex-1">
        <p className={clsx("truncate text-sm font-medium", projected ? "text-slate-600" : "text-slate-900")}>
          {title}
          {projected && <span className="badge-scheduled ml-2 align-middle">{t(locale, "expenseList.scheduled")}</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-400">{meta}</p>
      </div>
      <span className={clsx("flex-none text-sm font-semibold tabular-nums", projected ? "text-slate-400" : "text-slate-900")}>
        {amount}
      </span>
      {showActions && (
        <div className="flex flex-none items-center gap-1">
          {editHref && (
            <Link href={editHref} title={t(locale, "common.edit")} className="icon-btn h-7 w-7 hover:text-brand-600">
              ✎
            </Link>
          )}
          {onDelete && (
            <button
              type="button"
              title={t(locale, "common.delete")}
              disabled={deleteBusy}
              onClick={onDelete}
              className="icon-btn h-7 w-7 text-base hover:bg-negative-50 hover:text-negative-600"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
