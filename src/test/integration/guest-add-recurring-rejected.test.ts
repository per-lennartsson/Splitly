import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createHousehold } from "@/app/api/households/route";
import { POST as joinHousehold } from "@/app/api/households/join/route";
import { POST as addGuest } from "@/app/api/households/[id]/members/guests/route";
import { prisma } from "@/lib/prisma";
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

describe("Scenario 3: guest participants are EVENT-only and admin-only", () => {
  afterAll(cleanupTracked);

  it("rejects adding a guest to a RECURRING household and creates no rows", async () => {
    const alice = await createTestUser({ name: "Alice" });
    trackUser(alice.id);

    await mockSessionAs(alice);
    const createRes = await createHousehold(
      jsonRequest("http://test/api/households", "POST", {
        name: `${TEST_HOUSEHOLD_PREFIX}Birchwood Apartment`,
        householdType: "RECURRING",
      })
    );
    expect(createRes.status).toBe(201);
    const { household } = await asJson<{ household: { id: string } }>(createRes);
    trackHousehold(household.id);

    const rejectRes = await addGuest(
      jsonRequest(`http://test/api/households/${household.id}/members/guests`, "POST", { name: "Dana" }),
      paramsOf({ id: household.id })
    );
    expect(rejectRes.status).toBe(400);
    const rejectBody = await asJson<{ error: string }>(rejectRes);
    expect(rejectBody.error).toBe("Guests can only be added to event groups.");

    const members = await prisma.householdMember.findMany({ where: { householdId: household.id } });
    expect(members).toHaveLength(1); // just Alice — no guest row was created
  });

  it("rejects a non-admin member adding a guest to a valid EVENT household", async () => {
    const alice = await createTestUser({ name: "Alice" });
    const bob = await createTestUser({ name: "Bob" });
    trackUser(alice.id);
    trackUser(bob.id);

    await mockSessionAs(alice);
    const createRes = await createHousehold(
      jsonRequest("http://test/api/households", "POST", {
        name: `${TEST_HOUSEHOLD_PREFIX}Beach Weekend`,
        householdType: "EVENT",
      })
    );
    const { household } = await asJson<{ household: { id: string; inviteCode: string } }>(createRes);
    trackHousehold(household.id);

    await mockSessionAs(bob);
    await joinHousehold(jsonRequest("http://test/api/households/join", "POST", { inviteCode: household.inviteCode }));

    const forbiddenRes = await addGuest(
      jsonRequest(`http://test/api/households/${household.id}/members/guests`, "POST", { name: "Eve" }),
      paramsOf({ id: household.id })
    );
    expect(forbiddenRes.status).toBe(403);

    const members = await prisma.householdMember.findMany({ where: { householdId: household.id } });
    expect(members).toHaveLength(2); // just Alice and Bob — no guest row was created
  });
});
