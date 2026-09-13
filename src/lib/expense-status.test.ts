import { describe, expect, it } from "vitest";
import { nothingOwedByOthers } from "./expense-status";

describe("nothingOwedByOthers", () => {
  it("is true when the payer is the only one on the split", () => {
    expect(nothingOwedByOthers("per", [{ userId: "per", amountOwed: 299 }])).toBe(true);
  });

  it("is true when there are no splits at all", () => {
    expect(nothingOwedByOthers("per", [])).toBe(true);
  });

  it("is true when other members owe zero", () => {
    expect(
      nothingOwedByOthers("per", [
        { userId: "per", amountOwed: 1093 },
        { userId: "embla", amountOwed: 0 },
      ])
    ).toBe(true);
  });

  it("is false when someone else owes a share", () => {
    expect(
      nothingOwedByOthers("per", [
        { userId: "per", amountOwed: 396 },
        { userId: "embla", amountOwed: 396 },
      ])
    ).toBe(false);
  });

  it("is false when the payer owes nothing but someone else does", () => {
    expect(
      nothingOwedByOthers("per", [
        { userId: "embla", amountOwed: 2686 },
        { userId: "per", amountOwed: 0 },
      ])
    ).toBe(false);
  });
});
