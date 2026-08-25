import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createHousehold } from "@/app/api/households/route";
import { POST as joinHousehold } from "@/app/api/households/join/route";
import { POST as createExpense } from "@/app/api/households/[id]/expenses/route";
import { GET as getSettlements, POST as createSettlement } from "@/app/api/households/[id]/settlements/route";
import { GET as getBalances } from "@/app/api/households/[id]/balances/route";
import {
  asJson,
  cleanupTracked,
  createTestUser,
  jsonRequest,
  mockSessionAs,
  paramsOf,
  trackHousehold,
  trackUser,
  TEST_HOUSEHOLD_PREFIX,
} from "@/test/integration/helpers";

describe("Partial settlement tied to specific expenses", () => {
  afterAll(cleanupTracked);

  it("lets a debtor pay part of what they owe against chosen expenses, leaving a residual balance", async () => {
    const alice = await createTestUser({ name: "Alice" });
    const bob = await createTestUser({ name: "Bob" });
    trackUser(alice.id);
    trackUser(bob.id);

    await mockSessionAs(alice);
    const createRes = await createHousehold(
      jsonRequest("http://test/api/households", "POST", {
        name: `${TEST_HOUSEHOLD_PREFIX}Flat 2B`,
        householdType: "RECURRING",
      })
    );
    expect(createRes.status).toBe(201);
    const { household } = await asJson<{ household: { id: string; inviteCode: string } }>(createRes);
    trackHousehold(household.id);

    await mockSessionAs(bob);
    const joinRes = await joinHousehold(
      jsonRequest("http://test/api/households/join", "POST", { inviteCode: household.inviteCode })
    );
    expect(joinRes.status).toBe(201);

    await mockSessionAs(alice);
    const groceriesRes = await createExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
        title: "Groceries",
        amount: 60,
        paidBy: alice.id,
        date: "2026-02-01",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 30 },
          { userId: bob.id, amountOwed: 30 },
        ],
      }),
      paramsOf({ id: household.id })
    );
    expect(groceriesRes.status).toBe(201);
    const { expense: groceries } = await asJson<{ expense: { id: string } }>(groceriesRes);

    const internetRes = await createExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
        title: "Internet",
        amount: 40,
        paidBy: alice.id,
        date: "2026-02-01",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 20 },
          { userId: bob.id, amountOwed: 20 },
        ],
      }),
      paramsOf({ id: household.id })
    );
    expect(internetRes.status).toBe(201);

    const snacksRes = await createExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
        title: "Snacks (Bob's treat)",
        amount: 10,
        paidBy: bob.id,
        date: "2026-02-01",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 5 },
          { userId: bob.id, amountOwed: 5 },
        ],
      }),
      paramsOf({ id: household.id })
    );
    expect(snacksRes.status).toBe(201);
    const { expense: snacks } = await asJson<{ expense: { id: string } }>(snacksRes);

    const balances1Res = await getBalances(
      jsonRequest(`http://test/api/households/${household.id}/balances`, "GET"),
      paramsOf({ id: household.id })
    );
    const balances1 = await asJson<{ transactions: { fromUserId: string; toUserId: string; amount: number }[] }>(
      balances1Res
    );
    // Bob owes Alice 30 (groceries) + 20 (internet) - 5 (snacks) = 45 net.
    expect(balances1.transactions).toEqual([{ fromUserId: bob.id, toUserId: alice.id, amount: 45 }]);

    // Rejects an expense that Alice doesn't owe Bob for (paidBy is Bob, not Alice).
    await mockSessionAs(bob);
    const rejectedRes = await createSettlement(
      jsonRequest(`http://test/api/households/${household.id}/settlements`, "POST", {
        fromUserId: bob.id,
        toUserId: alice.id,
        amount: 30,
        expenseIds: [snacks.id],
      }),
      paramsOf({ id: household.id })
    );
    expect(rejectedRes.status).toBe(400);

    // Bob pays Alice a partial amount, tied to the groceries expense specifically.
    const settleRes = await createSettlement(
      jsonRequest(`http://test/api/households/${household.id}/settlements`, "POST", {
        fromUserId: bob.id,
        toUserId: alice.id,
        amount: 30,
        expenseIds: [groceries.id],
      }),
      paramsOf({ id: household.id })
    );
    expect(settleRes.status).toBe(201);
    const { settlement } = await asJson<{ settlement: { expenseIds: string[] } }>(settleRes);
    expect(settlement.expenseIds).toEqual([groceries.id]);

    const settlementsListRes = await getSettlements(
      jsonRequest(`http://test/api/households/${household.id}/settlements`, "GET"),
      paramsOf({ id: household.id })
    );
    const { settlements } = await asJson<{ settlements: { expenseIds: string[] }[] }>(settlementsListRes);
    expect(settlements).toHaveLength(1);
    expect(settlements[0].expenseIds).toEqual([groceries.id]);

    const balances2Res = await getBalances(
      jsonRequest(`http://test/api/households/${household.id}/balances`, "GET"),
      paramsOf({ id: household.id })
    );
    const balances2 = await asJson<{ transactions: { fromUserId: string; toUserId: string; amount: number }[] }>(
      balances2Res
    );
    // Residual: 45 - 30 = 15 still owed from Bob to Alice.
    expect(balances2.transactions).toEqual([{ fromUserId: bob.id, toUserId: alice.id, amount: 15 }]);
  });
});
