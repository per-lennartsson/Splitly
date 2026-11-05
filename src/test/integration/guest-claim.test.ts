import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createHousehold } from "@/app/api/households/route";
import { POST as joinHousehold } from "@/app/api/households/join/route";
import { POST as addGuest } from "@/app/api/households/[id]/members/guests/route";
import { POST as createClaimLink } from "@/app/api/households/[id]/members/[userId]/claim-link/route";
import { GET as previewClaim, POST as claim } from "@/app/api/claim/[token]/route";
import { POST as createExpense } from "@/app/api/households/[id]/expenses/route";
import { POST as createSettlement } from "@/app/api/households/[id]/settlements/route";
import { prisma } from "@/lib/prisma";
import { getHouseholdBalances } from "@/lib/household-balances";
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
  type TestSessionUser,
} from "@/test/integration/helpers";

async function netOf(householdId: string): Promise<Record<string, number>> {
  const { netPositions } = await getHouseholdBalances(householdId);
  return Object.fromEntries(netPositions.filter((p) => p.netBalance !== 0).map((p) => [p.userId, p.netBalance]));
}

/**
 * Alice (admin) + Bob + guest Sam on a trip:
 *  - Cabin 300 paid by Alice, 100 each.
 *  - Dinner 90 paid by Sam, 30 each.
 *  - Sam paid Alice 20 and Bob 10.
 * Nets: Alice +150, Bob -140, Sam -10.
 */
async function setupTrip() {
  const alice = await createTestUser({ name: "Alice" });
  const bob = await createTestUser({ name: "Bob" });
  trackUser(alice.id);
  trackUser(bob.id);

  await mockSessionAs(alice);
  const createRes = await createHousehold(
    jsonRequest("http://test/api/households", "POST", {
      name: `${TEST_HOUSEHOLD_PREFIX}Guest claim trip`,
      householdType: "EVENT",
    })
  );
  const { household } = await asJson<{ household: { id: string; inviteCode: string } }>(createRes);
  trackHousehold(household.id);

  await mockSessionAs(bob);
  await joinHousehold(jsonRequest("http://test/api/households/join", "POST", { inviteCode: household.inviteCode }));

  await mockSessionAs(alice);
  const guestRes = await addGuest(
    jsonRequest(`http://test/api/households/${household.id}/members/guests`, "POST", { name: "Sam" }),
    paramsOf({ id: household.id })
  );
  const { member } = await asJson<{ member: { userId: string } }>(guestRes);
  const samId = member.userId;
  trackUser(samId);

  const expense = (title: string, amount: number, paidBy: string, each: number) =>
    createExpense(
      jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
        title,
        amount,
        paidBy,
        date: "2026-07-01",
        splitType: "FIXED",
        splits: [alice.id, bob.id, samId].map((userId) => ({ userId, amountOwed: each })),
      }),
      paramsOf({ id: household.id })
    );
  expect((await expense("Cabin", 300, alice.id, 100)).status).toBe(201);
  expect((await expense("Dinner", 90, samId, 30)).status).toBe(201);

  for (const [toUserId, amount] of [
    [alice.id, 20],
    [bob.id, 10],
  ] as const) {
    const res = await createSettlement(
      jsonRequest(`http://test/api/households/${household.id}/settlements`, "POST", {
        fromUserId: samId,
        toUserId,
        amount,
      }),
      paramsOf({ id: household.id })
    );
    expect(res.status).toBe(201);
  }

  expect(await netOf(household.id)).toEqual({ [alice.id]: 150, [bob.id]: -140, [samId]: -10 });
  return { alice, bob, samId, householdId: household.id };
}

async function issueLink(admin: TestSessionUser, householdId: string, guestId: string): Promise<string> {
  await mockSessionAs(admin);
  const res = await createClaimLink(
    jsonRequest(`http://test/api/households/${householdId}/members/${guestId}/claim-link`, "POST"),
    paramsOf({ id: householdId, userId: guestId })
  );
  expect(res.status).toBe(201);
  const { path } = await asJson<{ path: string }>(res);
  return path.replace("/claim/", "");
}

describe("Guest claim: converting a guest into a real account", () => {
  afterAll(cleanupTracked);

  it("hands a guest's spot and history to a new account", async () => {
    const { alice, bob, samId, householdId } = await setupTrip();
    const token = await issueLink(alice, householdId, samId);

    const previewRes = await previewClaim(jsonRequest(`http://test/api/claim/${token}`, "GET"), paramsOf({ token }));
    expect(await asJson(previewRes)).toMatchObject({ guestName: "Sam" });

    const carol = await createTestUser({ name: "Carol" });
    trackUser(carol.id);
    await mockSessionAs(carol);
    const claimRes = await claim(jsonRequest(`http://test/api/claim/${token}`, "POST"), paramsOf({ token }));
    expect(claimRes.status).toBe(200);
    expect(await asJson(claimRes)).toEqual({ householdId });

    expect(await netOf(householdId)).toEqual({ [alice.id]: 150, [bob.id]: -140, [carol.id]: -10 });
    expect(await prisma.user.findUnique({ where: { id: samId } })).toBeNull();
    const membership = await prisma.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: carol.id } },
    });
    expect(membership).toMatchObject({ leftAt: null, role: "MEMBER", claimTokenHash: null });

    // Single use.
    const reuse = await claim(jsonRequest(`http://test/api/claim/${token}`, "POST"), paramsOf({ token }));
    expect(reuse.status).toBe(404);
  });

  it("merges a guest into an existing member, summing shared splits and dropping self-payments", async () => {
    const { alice, bob, samId, householdId } = await setupTrip();
    const token = await issueLink(alice, householdId, samId);

    await mockSessionAs(bob);
    const claimRes = await claim(jsonRequest(`http://test/api/claim/${token}`, "POST"), paramsOf({ token }));
    expect(claimRes.status).toBe(200);

    expect(await netOf(householdId)).toEqual({ [alice.id]: 150, [bob.id]: -150 });

    const bobSplits = await prisma.expenseSplit.findMany({
      where: { userId: bob.id, expense: { householdId } },
      include: { expense: { select: { title: true } } },
    });
    expect(Object.fromEntries(bobSplits.map((s) => [s.expense.title, Number(s.amountOwed)]))).toEqual({
      Cabin: 200,
      Dinner: 60,
    });
    expect(await prisma.settlement.count({ where: { householdId, fromUserId: bob.id, toUserId: bob.id } })).toBe(0);
    expect(await prisma.householdMember.count({ where: { householdId, leftAt: null } })).toBe(2);
  });

  it("rejects non-admin link creation, logged-out claims, expired and removed guests", async () => {
    const { alice, bob, samId, householdId } = await setupTrip();

    await mockSessionAs(bob);
    const forbidden = await createClaimLink(
      jsonRequest(`http://test/api/households/${householdId}/members/${samId}/claim-link`, "POST"),
      paramsOf({ id: householdId, userId: samId })
    );
    expect(forbidden.status).toBe(403);

    // Real members can't be "claimed".
    await mockSessionAs(alice);
    const notGuest = await createClaimLink(
      jsonRequest(`http://test/api/households/${householdId}/members/${bob.id}/claim-link`, "POST"),
      paramsOf({ id: householdId, userId: bob.id })
    );
    expect(notGuest.status).toBe(400);

    const token = await issueLink(alice, householdId, samId);

    const { getServerSession } = await import("next-auth");
    vi.mocked(getServerSession).mockResolvedValueOnce(null);
    const loggedOut = await claim(jsonRequest(`http://test/api/claim/${token}`, "POST"), paramsOf({ token }));
    expect(loggedOut.status).toBe(401);

    await prisma.householdMember.updateMany({
      where: { householdId, userId: samId },
      data: { claimTokenCreatedAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    await mockSessionAs(bob);
    const expired = await claim(jsonRequest(`http://test/api/claim/${token}`, "POST"), paramsOf({ token }));
    expect(expired.status).toBe(410);

    const fresh = await issueLink(alice, householdId, samId);
    await prisma.householdMember.updateMany({ where: { householdId, userId: samId }, data: { leftAt: new Date() } });
    await mockSessionAs(bob);
    const removed = await claim(jsonRequest(`http://test/api/claim/${fresh}`, "POST"), paramsOf({ token: fresh }));
    expect(removed.status).toBe(404);
  });
});
