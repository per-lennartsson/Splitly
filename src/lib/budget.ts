export type BudgetStatus = "ok" | "warning" | "over" | "no-limit";

const WARNING_THRESHOLD = 0.75;

export function budgetStatus(spent: number, limit: number | null): BudgetStatus {
  if (limit === null || limit <= 0) return "no-limit";
  if (spent > limit) return "over";
  if (spent >= limit * WARNING_THRESHOLD) return "warning";
  return "ok";
}

export function budgetProgressPercent(spent: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  return Math.min(100, Math.round((spent / limit) * 100));
}
