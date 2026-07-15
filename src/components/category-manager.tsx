"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { budgetProgressPercent, budgetStatus } from "@/lib/budget";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { intlLocale, type Locale } from "@/lib/i18n/translations";
import { t } from "@/lib/i18n/t";

interface CategoryVM {
  id: string;
  name: string;
  budgetLimit: number | null;
  color: string;
  spent: number;
}

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9", "#8b5cf6", "#14b8a6", "#eab308"];

const PROGRESS_CLASSES: Record<string, string> = {
  ok: "bg-positive-500",
  warning: "bg-warning-500",
  over: "bg-negative-500",
  "no-limit": "bg-slate-300",
};

function CategoryRow({
  category,
  householdId,
  currency,
  locale,
  onChanged,
}: {
  category: CategoryVM;
  householdId: string;
  currency: CurrencyCode;
  locale: Locale;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [budgetLimit, setBudgetLimit] = useState(category.budgetLimit?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = budgetStatus(category.spent, category.budgetLimit);
  const pct = budgetProgressPercent(category.spent, category.budgetLimit);
  const money = (n: number) => formatMoney(n, currency, intlLocale(locale));

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/households/${householdId}/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        budgetLimit: budgetLimit === "" ? null : Number(budgetLimit),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t(locale, "categories.genericSaveError"));
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function handleDelete() {
    if (!confirm(t(locale, "categories.deleteConfirm", { name: category.name }))) return;
    await fetch(`/api/households/${householdId}/categories/${category.id}`, { method: "DELETE" });
    onChanged();
  }

  if (editing) {
    return (
      <div className="card space-y-3">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{t(locale, "categories.monthlyLimit")}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            placeholder={t(locale, "common.none")}
            value={budgetLimit}
            onChange={(e) => setBudgetLimit(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-negative-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? t(locale, "householdSetup.saving") : t(locale, "common.save")}
          </button>
          <button onClick={() => setEditing(false)} className="btn-secondary flex-1">
            {t(locale, "common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-3 w-3 flex-none rounded-full" style={{ backgroundColor: category.color }} />
          <p className="truncate font-medium text-slate-900">{category.name}</p>
        </div>
        <div className="flex flex-none gap-3 text-sm">
          <button onClick={() => setEditing(true)} className="text-slate-500 hover:text-slate-700">
            {t(locale, "common.edit")}
          </button>
          <button onClick={handleDelete} className="text-negative-600 hover:text-negative-700">
            {t(locale, "common.delete")}
          </button>
        </div>
      </div>

      {category.budgetLimit !== null ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>{t(locale, "categories.spentOfLimit", { spent: money(category.spent), limit: money(category.budgetLimit) })}</span>
            <span
              className={clsx(
                status === "over" && "text-negative-600",
                status === "warning" && "text-warning-600",
                status === "ok" && "text-positive-600"
              )}
            >
              {status === "over"
                ? t(locale, "categories.overBudget")
                : status === "warning"
                ? t(locale, "categories.nearLimit")
                : t(locale, "categories.onTrack")}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={clsx("h-full rounded-full transition-all", PROGRESS_CLASSES[status])}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">{t(locale, "categories.spentNoLimit", { spent: money(category.spent) })}</p>
      )}
    </div>
  );
}

export function CategoryManager({
  householdId,
  householdType,
  currency,
  locale,
  categories,
}: {
  householdId: string;
  householdType: "RECURRING" | "EVENT";
  currency: CurrencyCode;
  locale: Locale;
  categories: CategoryVM[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const color = PALETTE[categories.length % PALETTE.length];
    const res = await fetch(`/api/households/${householdId}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        budgetLimit: budgetLimit === "" ? null : Number(budgetLimit),
        color,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t(locale, "categories.genericError"));
      return;
    }
    setName("");
    setBudgetLimit("");
    refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{t(locale, "categories.title")}</h2>
      </div>

      <form onSubmit={handleCreate} className="card mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <label className="label" htmlFor="catName">{t(locale, "categories.newCategory")}</label>
          <input id="catName" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="w-40">
          <label className="label" htmlFor="catLimit">
            {householdType === "RECURRING" ? t(locale, "categories.monthlyLimit") : t(locale, "categories.budgetLimit")}
          </label>
          <input
            id="catLimit"
            type="number"
            min={0}
            step="0.01"
            className="input"
            placeholder={t(locale, "common.optional")}
            value={budgetLimit}
            onChange={(e) => setBudgetLimit(e.target.value)}
          />
        </div>
        <button type="submit" disabled={creating} className="btn-primary">
          {creating ? t(locale, "categories.adding") : t(locale, "categories.add")}
        </button>
        {error && <p className="w-full text-sm text-negative-600">{error}</p>}
      </form>

      {categories.length === 0 ? (
        <p className="text-sm text-slate-400">{t(locale, "categories.noCategories")}</p>
      ) : (
        <div className="space-y-3">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              householdId={householdId}
              currency={currency}
              locale={locale}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
