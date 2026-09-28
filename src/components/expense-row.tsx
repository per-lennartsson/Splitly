"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { t } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/translations";

const SWIPE_OPEN_THRESHOLD = 30;

function tint(hex: string): string {
  return `${hex}1f`;
}

function abbreviate(label: string): string {
  return label.trim().slice(0, 2).toUpperCase();
}

export interface SplitShareVM {
  name: string;
  amount: string;
}

export function ExpenseRow({
  title,
  meta,
  amount,
  categoryName,
  categoryColor,
  splits,
  projected = false,
  locked = false,
  paid = false,
  partial = false,
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
  splits?: SplitShareVM[];
  projected?: boolean;
  locked?: boolean;
  paid?: boolean;
  /** Some, but not all, of what others owe on this expense has been paid back. */
  partial?: boolean;
  editHref?: string;
  onDelete?: () => void;
  deleteBusy?: boolean;
  locale: Locale;
}) {
  const color = categoryColor ?? "#8a909b";
  const abbr = abbreviate(categoryName ?? title);
  const showActions = !projected && !locked && (editHref || onDelete);

  const [swipeOpen, setSwipeOpen] = useState(false);
  const dragStartX = useRef<number | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (!showActions) return;
    dragStartX.current = e.clientX;
  }
  function onPointerUp(e: React.PointerEvent) {
    if (dragStartX.current === null) return;
    const dx = e.clientX - dragStartX.current;
    dragStartX.current = null;
    if (dx < -SWIPE_OPEN_THRESHOLD) setSwipeOpen(true);
    else if (dx > SWIPE_OPEN_THRESHOLD) setSwipeOpen(false);
  }

  return (
    <div className="relative isolate overflow-hidden sm:overflow-visible">
      {showActions && (
        <div className="absolute inset-y-0 right-0 z-0 flex w-[84px] sm:hidden">
          {editHref && (
            <Link
              href={editHref}
              onClick={() => setSwipeOpen(false)}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-brand-50 text-xs font-semibold text-brand-700"
            >
              {t(locale, "common.edit")}
            </Link>
          )}
          {onDelete && (
            <button
              type="button"
              disabled={deleteBusy}
              onClick={() => {
                setSwipeOpen(false);
                onDelete();
              }}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-negative-600 text-xs font-semibold text-white disabled:opacity-50"
            >
              {t(locale, "common.delete")}
            </button>
          )}
        </div>
      )}

      <div
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={() => showActions && swipeOpen && setSwipeOpen(false)}
        className={clsx(
          "relative z-10 flex min-h-[64px] items-center gap-3.5 bg-white px-4 py-2.5 transition-transform duration-150 hover:bg-slate-50 sm:min-h-0 sm:gap-3 sm:px-6",
          showActions && swipeOpen ? "-translate-x-[84px] sm:translate-x-0" : "translate-x-0"
        )}
      >
        <span
          className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl text-[13px] font-bold sm:h-[34px] sm:w-[34px] sm:rounded-xl sm:text-xs"
          style={{ backgroundColor: tint(color), color, opacity: projected ? 0.7 : 1 }}
        >
          {abbr}
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx("truncate text-base font-semibold sm:text-sm sm:font-medium", projected ? "text-slate-600" : "text-slate-900")}>
            {title}
            {projected && <span className="badge-scheduled ml-2 align-middle">{t(locale, "expenseList.scheduled")}</span>}
            {partial ? (
              <span className="badge-partial ml-2 align-middle">{t(locale, "expenseList.partlyPaid")}</span>
            ) : (
              (locked || paid) && <span className="badge-locked ml-2 align-middle">{t(locale, "expenseList.paidLocked")}</span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-slate-400 sm:text-xs">{meta}</p>
          {splits && splits.length > 1 && (
            <>
              <p className="mt-1 text-[13px] text-slate-400 sm:hidden">
                {t(locale, "expenseList.splitWays", { count: splits.length })}
              </p>
              <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
                {splits.map((s, i) => (
                  <span key={i} className="split-chip">
                    {s.name} {s.amount}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        <span
          className={clsx(
            "flex-none text-base font-bold tabular-nums sm:text-sm sm:font-semibold",
            projected ? "text-slate-400" : "text-slate-900"
          )}
        >
          {amount}
        </span>
        {showActions && (
          <div className="hidden flex-none items-center gap-1 sm:flex">
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
    </div>
  );
}
