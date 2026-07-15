import { toCents, fromCents } from "@/lib/money";

export type SplitType = "PERCENT" | "FIXED";

export interface PercentShareInput {
  userId: string;
  percent: number;
}

export interface FixedShareInput {
  userId: string;
  amountOwed: number;
}

export interface ResolvedSplit {
  userId: string;
  percent: number | null;
  amountOwed: number;
}

const PERCENT_TOLERANCE = 0.01;
const CENT_TOLERANCE = 1;

/** Sum of percentages must equal 100 (within floating-point tolerance). */
export function validatePercentTotal(shares: PercentShareInput[]): boolean {
  const total = shares.reduce((sum, s) => sum + s.percent, 0);
  return Math.abs(total - 100) <= PERCENT_TOLERANCE;
}

/** Sum of fixed amounts must equal the expense/template total (within a cent). */
export function validateFixedTotal(amount: number, shares: FixedShareInput[]): boolean {
  const totalCents = shares.reduce((sum, s) => sum + toCents(s.amountOwed), 0);
  return Math.abs(totalCents - toCents(amount)) <= CENT_TOLERANCE;
}

/**
 * Turns percentage shares into exact cent amounts that sum to `amount`.
 * Rounding remainder (if any) is handed out one cent at a time, largest
 * share first, so results are deterministic and never off by a cent.
 */
export function distributePercentSplit(
  amount: number,
  shares: PercentShareInput[]
): ResolvedSplit[] {
  const totalCents = toCents(amount);
  const raw = shares.map((s) => ({
    userId: s.userId,
    percent: s.percent,
    cents: Math.floor((totalCents * s.percent) / 100),
  }));

  let allocated = raw.reduce((sum, r) => sum + r.cents, 0);
  let remainder = totalCents - allocated;

  const order = [...raw].sort((a, b) => b.percent - a.percent || a.userId.localeCompare(b.userId));
  let i = 0;
  while (remainder > 0 && order.length > 0) {
    order[i % order.length].cents += 1;
    remainder -= 1;
    i += 1;
  }

  return raw.map((r) => ({
    userId: r.userId,
    percent: r.percent,
    amountOwed: fromCents(r.cents),
  }));
}

/** Fixed shares pass through unchanged; validate separately with validateFixedTotal. */
export function resolveFixedSplit(shares: FixedShareInput[]): ResolvedSplit[] {
  return shares.map((s) => ({
    userId: s.userId,
    percent: null,
    amountOwed: s.amountOwed,
  }));
}

export interface RecurringSplitOverrideInput {
  userId: string;
  percent: number | null;
  amountOwed: number | null;
}

export interface HouseholdMemberShareInput {
  userId: string;
  defaultSplitPercent: number | null;
}

/**
 * Resolves the effective split for a recurring template (or its projection):
 * - PERCENT: every active member participates, using their override percent
 *   if set, otherwise the household's default_split_percent for that member.
 * - FIXED: only members with an explicit override amount participate — there
 *   is no "default fixed amount" to fall back to.
 */
export function resolveRecurringSplitConfig(params: {
  splitType: SplitType;
  amount: number;
  members: HouseholdMemberShareInput[];
  overrides: RecurringSplitOverrideInput[];
}): ResolvedSplit[] {
  const { splitType, amount, members, overrides } = params;
  const overrideByUser = new Map(overrides.map((o) => [o.userId, o]));

  if (splitType === "FIXED") {
    const fixed = overrides.filter((o) => o.amountOwed !== null) as (RecurringSplitOverrideInput & {
      amountOwed: number;
    })[];
    return resolveFixedSplit(fixed.map((o) => ({ userId: o.userId, amountOwed: o.amountOwed })));
  }

  const shares: PercentShareInput[] = members
    .map((m) => {
      const override = overrideByUser.get(m.userId);
      const percent = override?.percent ?? m.defaultSplitPercent;
      return percent === null || percent === undefined ? null : { userId: m.userId, percent };
    })
    .filter((s): s is PercentShareInput => s !== null);

  return distributePercentSplit(amount, shares);
}
