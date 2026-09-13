import { describe, expect, it } from "vitest";
import { sumSharesByUser } from "./member-shares";

describe("sumSharesByUser", () => {
  it("sums each member's shares across expenses, largest first", () => {
    expect(
      sumSharesByUser([
        { userId: "embla", amountOwed: 396 },
        { userId: "per", amountOwed: 396 },
        { userId: "per", amountOwed: 599 },
        { userId: "embla", amountOwed: 250 },
        { userId: "per", amountOwed: 299 },
      ])
    ).toEqual([
      { userId: "per", amount: 1294 },
      { userId: "embla", amount: 646 },
    ]);
  });

  it("avoids float drift on fractional amounts", () => {
    expect(
      sumSharesByUser([
        { userId: "per", amountOwed: 0.1 },
        { userId: "per", amountOwed: 0.2 },
      ])
    ).toEqual([{ userId: "per", amount: 0.3 }]);
  });

  it("returns an empty list for no splits", () => {
    expect(sumSharesByUser([])).toEqual([]);
  });
});
