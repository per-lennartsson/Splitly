import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createHousehold } from "@/app/api/households/route";
import { POST as joinHousehold } from "@/app/api/households/join/route";
import { POST as createExpense } from "@/app/api/households/[id]/expenses/route";
import { PATCH as patchExpense, GET as getExpense } from "@/app/api/households/[id]/expenses/[expenseId]/route";
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

describe("Scenario 1: add a member, then retroactively add them to an existing expense", () => {
  afterAll(cleanupTracked);

  it("wipes and recreates the expense's splits so the new member is included, and balances update accordingly", async () => {
    const alice = await createTestUser({ name: "Alice" });
    const bob = await createTestUser({ name: "Bob" });
    const charlie = await createTestUser({ name: "Charlie" });
    trackUser(alice.id);
    trackUser(bob.id);
    trackUser(charlie.id);

    // Alice creates a RECURRING household and becomes ADMIN.
    await mockSessionAs(alice);
    const createRes = await createHousehold(
      jsonRequest("http://test/api/households", "POST", {
        name: `${TEST_HOUSEHOLD_PREFIX}Maple Street House`,
        householdType: "RECURRING",
      })
    );
    expect(createRes.status).toBe(201);
    const { household } = await asJson<{ household: { id: string; inviteCode: string } }>(createRes);
    trackHousehold(household.id);

    // Bob joins via invite code.
    await mockSessionAs(bob);
    const bobJoinRes = await joinHousehold(
      jsonRequest("http://test/api/households/join", "POST", { inviteCode: household.inviteCode })
    );
    expect(bobJoinRes.status).toBe(201);

    // Alice creates a $120 Groceries expense split 60/60 between Alice and Bob.
    await mockSessionAs(alice);
    const expenseRes = await createExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
        title: "Groceries",
        amount: 120,
        paidBy: alice.id,
        date: "2026-06-01",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 60 },
          { userId: bob.id, amountOwed: 60 },
        ],
      }),
      paramsOf({ id: household.id })
    );
    expect(expenseRes.status).toBe(201);
    const { expense } = await asJson<{ expense: { id: string } }>(expenseRes);

    const balancesAfterCreate = await getBalances(
      jsonRequest(`http://test/api/households/${household.id}/balances`, "GET"),
      paramsOf({ id: household.id })
    );
    const balances1 = await asJson<{ transactions: { fromUserId: string; toUserId: string; amount: number }[] }>(
      balancesAfterCreate
    );
    expect(balances1.transactions).toEqual([{ fromUserId: bob.id, toUserId: alice.id, amount: 60 }]);

    // Charlie joins the household after the expense already exists.
    await mockSessionAs(charlie);
    const charlieJoinRes = await joinHousehold(
      jsonRequest("http://test/api/households/join", "POST", { inviteCode: household.inviteCode })
    );
    expect(charlieJoinRes.status).toBe(201);

    // Alice retroactively adds Charlie to the existing expense by editing it,
    // resubmitting the full splits array (the PATCH route wipes and recreates
    // all ExpenseSplit rows rather than appending).
    await mockSessionAs(alice);
    const patchRes = await patchExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses/${expense.id}`, "PATCH", {
        title: "Groceries",
        amount: 120,
        paidBy: alice.id,
        date: "2026-06-01",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 40 },
          { userId: bob.id, amountOwed: 40 },
          { userId: charlie.id, amountOwed: 40 },
        ],
      }),
      paramsOf({ id: household.id, expenseId: expense.id })
    );
    expect(patchRes.status).toBe(200);

    const refetchRes = await getExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses/${expense.id}`, "GET"),
      paramsOf({ id: household.id, expenseId: expense.id })
    );
    const { expense: refetched } = await asJson<{ expense: { splits: unknown[] } }>(refetchRes);
    expect(refetched.splits).toHaveLength(3);

    const balancesAfterPatch = await getBalances(
      jsonRequest(`http://test/api/households/${household.id}/balances`, "GET"),
      paramsOf({ id: household.id })
    );
    const balances2 = await asJson<{ transactions: { fromUserId: string; toUserId: string; amount: number }[] }>(
      balancesAfterPatch
    );
    const byFrom = Object.fromEntries(balances2.transactions.map((t) => [t.fromUserId, t.amount]));
    expect(byFrom[bob.id]).toBe(40);
    expect(byFrom[charlie.id]).toBe(40);
    expect(balances2.transactions).toHaveLength(2);
  });
});
