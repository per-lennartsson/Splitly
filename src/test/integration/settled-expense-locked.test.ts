import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createHousehold } from "@/app/api/households/route";
import { POST as joinHousehold } from "@/app/api/households/join/route";
import { POST as createExpense } from "@/app/api/households/[id]/expenses/route";
import { PATCH as patchExpense, DELETE as deleteExpense } from "@/app/api/households/[id]/expenses/[expenseId]/route";
import { POST as createSettlement } from "@/app/api/households/[id]/settlements/route";
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

describe("An expense tagged on a settlement is locked from further edits", () => {
  afterAll(cleanupTracked);

  it("rejects PATCH and DELETE on an expense once a payment has been recorded for it", async () => {
    const alice = await createTestUser({ name: "Alice" });
    const bob = await createTestUser({ name: "Bob" });
    trackUser(alice.id);
    trackUser(bob.id);

    await mockSessionAs(alice);
    const createRes = await createHousehold(
      jsonRequest("http://test/api/households", "POST", {
        name: `${TEST_HOUSEHOLD_PREFIX}Locked Expense House`,
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
    const expenseRes = await createExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
        title: "Groceries",
        amount: 60,
        paidBy: alice.id,
        date: "2026-03-01",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 30 },
          { userId: bob.id, amountOwed: 30 },
        ],
      }),
      paramsOf({ id: household.id })
    );
    expect(expenseRes.status).toBe(201);
    const { expense } = await asJson<{ expense: { id: string } }>(expenseRes);

    // An unsettled expense can still be edited and deleted freely.
    const patchBeforeRes = await patchExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses/${expense.id}`, "PATCH", {
        title: "Groceries (corrected)",
        amount: 60,
        paidBy: alice.id,
        date: "2026-03-01",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 30 },
          { userId: bob.id, amountOwed: 30 },
        ],
      }),
      paramsOf({ id: household.id, expenseId: expense.id })
    );
    expect(patchBeforeRes.status).toBe(200);

    await mockSessionAs(bob);
    const settleRes = await createSettlement(
      jsonRequest(`http://test/api/households/${household.id}/settlements`, "POST", {
        fromUserId: bob.id,
        toUserId: alice.id,
        amount: 30,
        expenseIds: [expense.id],
      }),
      paramsOf({ id: household.id })
    );
    expect(settleRes.status).toBe(201);

    // Once tagged on that settlement, the expense is locked for both parties.
    const patchAfterRes = await patchExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses/${expense.id}`, "PATCH", {
        title: "Groceries (tampered)",
        amount: 60,
        paidBy: alice.id,
        date: "2026-03-01",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 30 },
          { userId: bob.id, amountOwed: 30 },
        ],
      }),
      paramsOf({ id: household.id, expenseId: expense.id })
    );
    expect(patchAfterRes.status).toBe(400);

    await mockSessionAs(alice);
    const deleteAfterRes = await deleteExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses/${expense.id}`, "DELETE"),
      paramsOf({ id: household.id, expenseId: expense.id })
    );
    expect(deleteAfterRes.status).toBe(400);
  });
});
