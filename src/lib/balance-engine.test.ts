import { describe, expect, it } from "vitest";
import { calculateBalances, simplifyDebts, type NetPosition } from "@/lib/balance-engine";

describe("calculateBalances", () => {
  it("computes a simple 50/50 split between two people", () => {
    const result = calculateBalances(
      [
        {
          id: "e1",
          amount: 100,
          paidBy: "alice",
          splits: [
            { userId: "alice", amountOwed: 50 },
            { userId: "bob", amountOwed: 50 },
          ],
        },
      ],
      []
    );

    const alice = result.netPositions.find((p) => p.userId === "alice")!;
    const bob = result.netPositions.find((p) => p.userId === "bob")!;

    expect(alice.netBalance).toBe(50);
    expect(bob.netBalance).toBe(-50);
    expect(result.transactions).toEqual([{ fromUserId: "bob", toUserId: "alice", amount: 50 }]);
  });

  it("nets multiple expenses across different payers", () => {
    const result = calculateBalances(
      [
        {
          id: "e1",
          amount: 90,
          paidBy: "alice",
          splits: [
            { userId: "alice", amountOwed: 30 },
            { userId: "bob", amountOwed: 30 },
            { userId: "carol", amountOwed: 30 },
          ],
        },
        {
          id: "e2",
          amount: 60,
          paidBy: "bob",
          splits: [
            { userId: "alice", amountOwed: 20 },
            { userId: "bob", amountOwed: 20 },
            { userId: "carol", amountOwed: 20 },
          ],
        },
      ],
      []
    );

    const byUser = Object.fromEntries(result.netPositions.map((p) => [p.userId, p.netBalance]));
    // alice: paid 90, owed 30+20=50 -> +40
    // bob: paid 60, owed 30+20=50 -> +10
    // carol: paid 0, owed 30+20=50 -> -50
    expect(byUser.alice).toBe(40);
    expect(byUser.bob).toBe(10);
    expect(byUser.carol).toBe(-50);

    const total = result.transactions.reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(50);
    // Carol owes everyone; minimal transaction set should route through her only.
    expect(result.transactions.every((t) => t.fromUserId === "carol")).toBe(true);
  });

  it("settlements move net balances toward zero", () => {
    const result = calculateBalances(
      [
        {
          id: "e1",
          amount: 100,
          paidBy: "alice",
          splits: [
            { userId: "alice", amountOwed: 50 },
            { userId: "bob", amountOwed: 50 },
          ],
        },
      ],
      [{ id: "s1", fromUserId: "bob", toUserId: "alice", amount: 50 }]
    );

    const alice = result.netPositions.find((p) => p.userId === "alice")!;
    const bob = result.netPositions.find((p) => p.userId === "bob")!;
    expect(alice.netBalance).toBe(0);
    expect(bob.netBalance).toBe(0);
    expect(result.transactions).toEqual([]);
  });

  it("partial settlement leaves a residual balance", () => {
    const result = calculateBalances(
      [
        {
          id: "e1",
          amount: 100,
          paidBy: "alice",
          splits: [
            { userId: "alice", amountOwed: 50 },
            { userId: "bob", amountOwed: 50 },
          ],
        },
      ],
      [{ id: "s1", fromUserId: "bob", toUserId: "alice", amount: 20 }]
    );

    const bob = result.netPositions.find((p) => p.userId === "bob")!;
    expect(bob.netBalance).toBe(-30);
    expect(result.transactions).toEqual([{ fromUserId: "bob", toUserId: "alice", amount: 30 }]);
  });
});

describe("simplifyDebts", () => {
  it("produces the fewest transactions for a four-person tangle", () => {
    const positions: NetPosition[] = [
      { userId: "a", paid: 0, owed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: 30 },
      { userId: "b", paid: 0, owed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: 10 },
      { userId: "c", paid: 0, owed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: -25 },
      { userId: "d", paid: 0, owed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: -15 },
    ];

    const transactions = simplifyDebts(positions);
    // 4 non-zero balances can always be settled in at most n-1 = 3 transactions.
    expect(transactions.length).toBeLessThanOrEqual(3);

    const net: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    for (const t of transactions) {
      net[t.fromUserId] -= t.amount;
      net[t.toUserId] += t.amount;
    }
    expect(net.a).toBeCloseTo(30);
    expect(net.b).toBeCloseTo(10);
    expect(net.c).toBeCloseTo(-25);
    expect(net.d).toBeCloseTo(-15);
  });

  it("returns no transactions when everyone is already settled", () => {
    const positions: NetPosition[] = [
      { userId: "a", paid: 0, owed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: 0 },
      { userId: "b", paid: 0, owed: 0, settlementsPaid: 0, settlementsReceived: 0, netBalance: 0 },
    ];
    expect(simplifyDebts(positions)).toEqual([]);
  });
});
