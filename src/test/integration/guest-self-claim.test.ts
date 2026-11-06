import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createHousehold } from "@/app/api/households/route";
import { POST as joinHousehold } from "@/app/api/households/join/route";
import { POST as addGuest } from "@/app/api/households/[id]/members/guests/route";
import { POST as claimSelf } from "@/app/api/households/[id]/members/[userId]/claim-self/route";
import { POST as createExpense } from "@/app/api/households/[id]/expenses/route";
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

/** Alice (admin) with guests Sam and Kim; Cabin 300 paid by Alice, 100 each. */
async function setupTripWithGuests() {
  const alice = await createTestUser({ name: "Alice" });
  trackUser(alice.id);

  await mockSessionAs(alice);
  const createRes = await createHousehold(
    jsonRequest("http://test/api/households", "POST", {
      name: `${TEST_HOUSEHOLD_PREFIX}Self-claim trip`,
      householdType: "EVENT",
    })
  );
  const { household } = await asJson<{ household: { id: string; inviteCode: string } }>(createRes);
  trackHousehold(household.id);

  const guestIds: string[] = [];
  for (const name of ["Sam", "Kim"]) {
    const res = await addGuest(
      jsonRequest(`http://test/api/households/${household.id}/members/guests`, "POST", { name }),
      paramsOf({ id: household.id })
    );
    const { member } = await asJson<{ member: { userId: string } }>(res);
    trackUser(member.userId);
    guestIds.push(member.userId);
  }
  const [samId, kimId] = guestIds;

  const cabin = await createExpense(
    jsonRequest(`http://test/api/households/${household.id}/expenses`, "POST", {
      title: "Cabin",
      amount: 300,
      paidBy: alice.id,
      date: "2026-07-01",
      splitType: "FIXED",
      splits: [alice.id, samId, kimId].map((userId) => ({ userId, amountOwed: 100 })),
    }),
    paramsOf({ id: household.id })
  );
  expect(cabin.status).toBe(201);

  return { alice, samId, kimId, householdId: household.id, inviteCode: household.inviteCode };
}

async function joinAs(user: TestSessionUser, inviteCode: string) {
  await mockSessionAs(user);
  const res = await joinHousehold(jsonRequest("http://test/api/households/join", "POST", { inviteCode }));
  expect(res.status).toBe(201);
  return asJson<{ guests: { userId: string; name: string }[] }>(res);
}

function claimSelfAs(householdId: string, guestId: string) {
  return claimSelf(
    jsonRequest(`http://test/api/households/${householdId}/members/${guestId}/claim-self`, "POST"),
    paramsOf({ id: householdId, userId: guestId })
  );
}

describe("Guest self-claim after joining with the group code", () => {
  afterAll(cleanupTracked);

  it("offers the guests on join and lets the joiner take one over", async () => {
    const { alice, samId, kimId, householdId, inviteCode } = await setupTripWithGuests();

    const carol = await createTestUser({ name: "Carol" });
    trackUser(carol.id);
    const { guests } = await joinAs(carol, inviteCode);
    expect(guests.map((g) => g.name).sort()).toEqual(["Kim", "Sam"]);

    const res = await claimSelfAs(householdId, samId);
    expect(res.status).toBe(200);

    expect(await netOf(householdId)).toEqual({ [alice.id]: 200, [carol.id]: -100, [kimId]: -100 });
    expect(await prisma.user.findUnique({ where: { id: samId } })).toBeNull();
    expect(await prisma.householdMember.count({ where: { householdId, leftAt: null } })).toBe(3);

    // One guest per member.
    const second = await claimSelfAs(householdId, kimId);
    expect(second.status).toBe(400);
  });

  it("rejects the group creator, non-members, real members as targets, and joins outside the window", async () => {
    const { alice, samId, householdId, inviteCode } = await setupTripWithGuests();

    // The creator added these guests themselves; they joined "just now" but must not self-claim.
    await mockSessionAs(alice);
    expect((await claimSelfAs(householdId, samId)).status).toBe(400);

    const outsider = await createTestUser({ name: "Outsider" });
    trackUser(outsider.id);
    await mockSessionAs(outsider);
    expect((await claimSelfAs(householdId, samId)).status).toBe(403);

    const dave = await createTestUser({ name: "Dave" });
    trackUser(dave.id);
    await joinAs(dave, inviteCode);
    expect((await claimSelfAs(householdId, alice.id)).status).toBe(400);

    await prisma.householdMember.updateMany({
      where: { householdId, userId: dave.id },
      data: { joinedAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    expect((await claimSelfAs(householdId, samId)).status).toBe(400);
  });

  it("returns no guests when joining a recurring household", async () => {
    const owner = await createTestUser({ name: "Owner" });
    trackUser(owner.id);
    await mockSessionAs(owner);
    const createRes = await createHousehold(
      jsonRequest("http://test/api/households", "POST", {
        name: `${TEST_HOUSEHOLD_PREFIX}Flat`,
        householdType: "RECURRING",
      })
    );
    const { household } = await asJson<{ household: { id: string; inviteCode: string } }>(createRes);
    trackHousehold(household.id);

    const eve = await createTestUser({ name: "Eve" });
    trackUser(eve.id);
    const { guests } = await joinAs(eve, household.inviteCode);
    expect(guests).toEqual([]);
  });
});
