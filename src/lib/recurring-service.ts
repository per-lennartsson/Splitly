import type { RecurringInput } from "@/lib/recurring-schema";
import {
  validateFixedTotal,
  validatePercentTotal,
  type HouseholdMemberShareInput,
} from "@/lib/split-calculator";

export class RecurringValidationError extends Error {}

/**
 * Validates that a recurring template's effective split (overrides layered
 * on top of household default_split_percent) is internally consistent:
 * PERCENT must total 100%, FIXED overrides must total the template amount.
 */
export function validateRecurringSplit(
  input: Pick<RecurringInput, "amount" | "splitType" | "overrides">,
  activeMembers: HouseholdMemberShareInput[]
) {
  const activeIds = new Set(activeMembers.map((m) => m.userId));
  for (const o of input.overrides) {
    if (!activeIds.has(o.userId)) {
      throw new RecurringValidationError(`${o.userId} is not an active member of this household.`);
    }
  }

  if (input.splitType === "PERCENT") {
    const overrideByUser = new Map(input.overrides.map((o) => [o.userId, o]));
    const effective = activeMembers
      .map((m) => {
        const override = overrideByUser.get(m.userId);
        const percent = override?.percent ?? m.defaultSplitPercent;
        return percent === null || percent === undefined ? null : { userId: m.userId, percent };
      })
      .filter((s): s is { userId: string; percent: number } => s !== null);

    if (!validatePercentTotal(effective)) {
      throw new RecurringValidationError(
        "Effective split percentages (overrides + household defaults) must total 100%."
      );
    }
    return;
  }

  const fixed = input.overrides.filter((o) => o.amountOwed !== null && o.amountOwed !== undefined) as {
    userId: string;
    amountOwed: number;
  }[];
  if (fixed.length === 0) {
    throw new RecurringValidationError("FIXED split recurring expenses need at least one override amount.");
  }
  if (!validateFixedTotal(input.amount, fixed)) {
    throw new RecurringValidationError("Fixed override amounts must sum to the template amount.");
  }
}
