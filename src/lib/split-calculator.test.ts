import { describe, expect, it } from "vitest";
import {
  distributePercentSplit,
  resolveRecurringSplitConfig,
  validateFixedTotal,
  validatePercentTotal,
} from "@/lib/split-calculator";

describe("validatePercentTotal", () => {
  it("accepts shares summing to 100", () => {
    expect(validatePercentTotal([{ userId: "a", percent: 60 }, { userId: "b", percent: 40 }])).toBe(true);
  });

  it("rejects shares that do not sum to 100", () => {
    expect(validatePercentTotal([{ userId: "a", percent: 60 }, { userId: "b", percent: 30 }])).toBe(false);
  });
});

describe("validateFixedTotal", () => {
  it("accepts fixed shares summing to the total amount", () => {
    expect(
      validateFixedTotal(100, [
        { userId: "a", amountOwed: 60 },
        { userId: "b", amountOwed: 40 },
      ])
    ).toBe(true);
  });

  it("rejects fixed shares that do not sum to the total amount", () => {
    expect(
      validateFixedTotal(100, [
        { userId: "a", amountOwed: 60 },
        { userId: "b", amountOwed: 30 },
      ])
    ).toBe(false);
  });
});

describe("distributePercentSplit", () => {
  it("splits evenly with no rounding remainder", () => {
    const result = distributePercentSplit(100, [
      { userId: "a", percent: 50 },
      { userId: "b", percent: 50 },
    ]);
    expect(result).toEqual([
      { userId: "a", percent: 50, amountOwed: 50 },
      { userId: "b", percent: 50, amountOwed: 50 },
    ]);
  });

  it("distributes the rounding remainder so the total matches exactly", () => {
    const result = distributePercentSplit(100, [
      { userId: "a", percent: 33.33 },
      { userId: "b", percent: 33.33 },
      { userId: "c", percent: 33.34 },
    ]);
    const total = result.reduce((sum, r) => sum + r.amountOwed, 0);
    expect(total).toBe(100);
  });

  it("handles an odd cent split between two equal shares deterministically", () => {
    const result = distributePercentSplit(10.01, [
      { userId: "a", percent: 50 },
      { userId: "b", percent: 50 },
    ]);
    const total = result.reduce((sum, r) => sum + r.amountOwed, 0);
    expect(total).toBe(10.01);
    // Tie-break is alphabetical by userId, so "a" absorbs the extra cent.
    expect(result.find((r) => r.userId === "a")!.amountOwed).toBe(5.01);
    expect(result.find((r) => r.userId === "b")!.amountOwed).toBe(5.0);
  });
});

describe("resolveRecurringSplitConfig", () => {
  it("falls back to household default_split_percent when no override exists", () => {
    const result = resolveRecurringSplitConfig({
      splitType: "PERCENT",
      amount: 1000,
      members: [
        { userId: "a", defaultSplitPercent: 60 },
        { userId: "b", defaultSplitPercent: 40 },
      ],
      overrides: [],
    });
    expect(result.find((r) => r.userId === "a")!.amountOwed).toBe(600);
    expect(result.find((r) => r.userId === "b")!.amountOwed).toBe(400);
  });

  it("uses a per-user override percent when present", () => {
    const result = resolveRecurringSplitConfig({
      splitType: "PERCENT",
      amount: 1000,
      members: [
        { userId: "a", defaultSplitPercent: 60 },
        { userId: "b", defaultSplitPercent: 40 },
      ],
      overrides: [{ userId: "a", percent: 70, amountOwed: null }, { userId: "b", percent: 30, amountOwed: null }],
    });
    expect(result.find((r) => r.userId === "a")!.amountOwed).toBe(700);
    expect(result.find((r) => r.userId === "b")!.amountOwed).toBe(300);
  });

  it("for FIXED splits, only includes members with an explicit override amount", () => {
    const result = resolveRecurringSplitConfig({
      splitType: "FIXED",
      amount: 100,
      members: [
        { userId: "a", defaultSplitPercent: 60 },
        { userId: "b", defaultSplitPercent: 40 },
      ],
      overrides: [{ userId: "a", percent: null, amountOwed: 100 }],
    });
    expect(result).toEqual([{ userId: "a", percent: null, amountOwed: 100 }]);
  });
});
