import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createHousehold } from "@/app/api/households/route";
import { POST as joinHousehold } from "@/app/api/households/join/route";
import { POST as addGuest } from "@/app/api/households/[id]/members/guests/route";
import { POST as createExpense } from "@/app/api/households/[id]/expenses/route";
import { POST as createSettlement } from "@/app/api/households/[id]/settlements/route";
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

describe("Scenario 2: EVENT trip with a guest participant, settled up", () => {
  afterAll(cleanupTracked);

  it("splits expenses across a guest participant and zeroes out after settlement", async () => {
    const alice = await createTestUser({ name: "Alice" });
    const bob = await createTestUser({ name: "Bob" });
    trackUser(alice.id);
    trackUser(bob.id);

    await mockSessionAs(alice);
    const createRes = await createHousehold(
      jsonRequest("http://test/api/households", "POST", {
        name: `${TEST_HOUSEHOLD_PREFIX}Ski Trip 2026`,
        householdType: "EVENT",
      })
    );
    expect(createRes.status).toBe(201);
    const { household } = await asJson<{ household: { id: string; inviteCode: string } }>(createRes);
    trackHousehold(household.id);

    await mockSessionAs(bob);
    const bobJoinRes = await joinHousehold(
      jsonRequest("http://test/api/households/join", "POST", { inviteCode: household.inviteCode })
    );
    expect(bobJoinRes.status).toBe(201);

    // Alice (admin) adds a guest participant, Sam, who never logs in.
    await mockSessionAs(alice);
    const guestRes = await addGuest(
      jsonRequest(`http://test/api/households/${household.id}/members/guests`, "POST", { name: "Sam" }),
      paramsOf({ id: household.id })
    );
    expect(guestRes.status).toBe(201);
    const { member: sam } = await asJson<{ member: { userId: string } }>(guestRes);
    trackUser(sam.userId);

    const cabinRes = await createExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
        title: "Cabin rental",
        amount: 300,
        paidBy: alice.id,
        date: "2026-01-10",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 100 },
          { userId: bob.id, amountOwed: 100 },
          { userId: sam.userId, amountOwed: 100 },
        ],
      }),
      paramsOf({ id: household.id })
    );
    expect(cabinRes.status).toBe(201);

    await mockSessionAs(bob);
    const liftRes = await createExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
        title: "Lift tickets",
        amount: 150,
        paidBy: bob.id,
        date: "2026-01-11",
        splitType: "FIXED",
        splits: [
          { userId: alice.id, amountOwed: 50 },
          { userId: bob.id, amountOwed: 50 },
          { userId: sam.userId, amountOwed: 50 },
        ],
      }),
      paramsOf({ id: household.id })
    );
    expect(liftRes.status).toBe(201);

    const balances1Res = await getBalances(
      jsonRequest(`http://test/api/households/${household.id}/balances`, "GET"),
      paramsOf({ id: household.id })
    );
    const balances1 = await asJson<{ transactions: { fromUserId: string; toUserId: string; amount: number }[] }>(
      balances1Res
    );
    // Alice net +150, Bob net 0, Sam net -150: Bob nets out and gets no line.
    expect(balances1.transactions).toEqual([{ fromUserId: sam.userId, toUserId: alice.id, amount: 150 }]);

    // Settle up: Sam pays Alice the full $150 owed.
    await mockSessionAs(alice);
    const settleRes = await createSettlement(
      jsonRequest(`http://test/api/households/${household.id}/settlements`, "POST", {
        fromUserId: sam.userId,
        toUserId: alice.id,
        amount: 150,
      }),
      paramsOf({ id: household.id })
    );
    expect(settleRes.status).toBe(201);

    const balances2Res = await getBalances(
      jsonRequest(`http://test/api/households/${household.id}/balances`, "GET"),
      paramsOf({ id: household.id })
    );
    const balances2 = await asJson<{ transactions: unknown[] }>(balances2Res);
    expect(balances2.transactions).toEqual([]);
  });
});
