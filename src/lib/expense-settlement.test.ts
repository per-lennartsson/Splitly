import { describe, expect, it } from "vitest";
import { allocateSettlements, type SettlementExpenseInput } from "@/lib/expense-settlement";

// Bob owes Alice half of each expense Alice paid.
function aliceExpense(id: string, day: number, amount: number): SettlementExpenseInput {
  return {
    id,
    date: new Date(2026, 0, day),
    paidBy: "alice",
    splits: [
      { userId: "alice", amountOwed: amount / 2 },
      { userId: "bob", amountOwed: amount / 2 },
    ],
  };
}

const remainingById = (result: ReturnType<typeof allocateSettlements>) =>
  Object.fromEntries(result.map((s) => [s.expenseId, s.remaining]));

describe("allocateSettlements", () => {
  const expenses = [aliceExpense("e1", 1, 200), aliceExpense("e2", 2, 200), aliceExpense("e3", 3, 200)];

  it("leaves every share open when nothing is paid", () => {
    expect(remainingById(allocateSettlements(expenses, []))).toEqual({ e1: 100, e2: 100, e3: 100 });
  });

  it("applies an unlinked custom amount oldest to newest", () => {
    const result = allocateSettlements(expenses, [{ id: "s1", fromUserId: "bob", toUserId: "alice", amount: 150 }]);
    expect(remainingById(result)).toEqual({ e1: 0, e2: 50, e3: 100 });
  });

  it("settles checked expenses first, even if they are newest", () => {
    const result = allocateSettlements(
      expenses,
      [{ id: "s1", fromUserId: "bob", toUserId: "alice", amount: 100, expenseIds: ["e3"] }]
    );
    expect(remainingById(result)).toEqual({ e1: 100, e2: 100, e3: 0 });
  });

  it("combines an earlier custom amount with a later checked payment without overpaying", () => {
    // Custom 150 covers e1 fully and e2 halfway; checking e2 then only costs the remaining 50.
    const result = allocateSettlements(
      expenses,
      [
        { id: "s1", fromUserId: "bob", toUserId: "alice", amount: 150 },
        { id: "s2", fromUserId: "bob", toUserId: "alice", amount: 50, expenseIds: ["e2"] },
      ]
    );
    expect(remainingById(result)).toEqual({ e1: 0, e2: 0, e3: 100 });
  });

  it("cancels out mutual debts between two people", () => {
    const bobPaid: SettlementExpenseInput = {
      id: "b1",
      date: new Date(2026, 0, 5),
      paidBy: "bob",
      splits: [
        { userId: "alice", amountOwed: 60 },
        { userId: "bob", amountOwed: 60 },
      ],
    };
    const result = allocateSettlements([aliceExpense("e1", 1, 200), bobPaid], []);
    // Bob owes 100, Alice owes 60 → Bob's net debt is 40; Alice's share is fully offset.
    expect(remainingById(result)).toEqual({ e1: 40, b1: 0 });
  });

  it("does not offset against debts that were already paid in cash", () => {
    const bobPaid: SettlementExpenseInput = {
      id: "b1",
      date: new Date(2026, 0, 5),
      paidBy: "bob",
      splits: [
        { userId: "alice", amountOwed: 60 },
        { userId: "bob", amountOwed: 60 },
      ],
    };
    const result = allocateSettlements(
      [aliceExpense("e1", 1, 200), bobPaid],
      [{ id: "s1", fromUserId: "alice", toUserId: "bob", amount: 60 }]
    );
    expect(remainingById(result)).toEqual({ e1: 100, b1: 0 });
  });

  it("caps open shares at the debtor's overall debt when payments go through a third person", () => {
    // Carol owes Bob 100, Bob owes Alice 100. Simplified: Carol pays Alice directly.
    const result = allocateSettlements(
      [
        aliceExpense("e1", 1, 200),
        {
          id: "c1",
          date: new Date(2026, 0, 2),
          paidBy: "bob",
          splits: [
            { userId: "bob", amountOwed: 100 },
            { userId: "carol", amountOwed: 100 },
          ],
        },
      ],
      [{ id: "s1", fromUserId: "carol", toUserId: "alice", amount: 100 }]
    );
    const bobShare = result.find((s) => s.expenseId === "e1" && s.debtorId === "bob")!;
    const carolShare = result.find((s) => s.expenseId === "c1" && s.debtorId === "carol")!;
    expect(carolShare.remaining).toBe(0);
    // Bob is net zero overall (owed 100 by Carol, owes 100 to Alice) → nothing left open.
    expect(bobShare.remaining).toBe(0);
  });

  it("ignores tags on expenses outside the paying pair", () => {
    const result = allocateSettlements(expenses, [
      { id: "s1", fromUserId: "bob", toUserId: "alice", amount: 100, expenseIds: ["unknown"] },
    ]);
    expect(remainingById(result)).toEqual({ e1: 0, e2: 100, e3: 100 });
  });

  it("spreads a tagged payment over its expenses oldest first, rest goes oldest-first overall", () => {
    // Pays 150 tagged with e2+e3: e2 fully, e3 half. Nothing left for e1.
    const result = allocateSettlements(expenses, [
      { id: "s1", fromUserId: "bob", toUserId: "alice", amount: 150, expenseIds: ["e3", "e2"] },
    ]);
    expect(remainingById(result)).toEqual({ e1: 100, e2: 0, e3: 50 });
  });

  it("sends a tagged overpayment to the oldest untagged expenses", () => {
    const result = allocateSettlements(expenses, [
      { id: "s1", fromUserId: "bob", toUserId: "alice", amount: 150, expenseIds: ["e3"] },
    ]);
    expect(remainingById(result)).toEqual({ e1: 50, e2: 100, e3: 0 });
  });
});
