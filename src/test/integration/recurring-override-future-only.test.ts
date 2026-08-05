import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST as createHousehold } from "@/app/api/households/route";
import { POST as joinHousehold } from "@/app/api/households/join/route";
import { PATCH as patchMembers } from "@/app/api/households/[id]/members/route";
import { POST as createRecurring } from "@/app/api/households/[id]/recurring/route";
import { PATCH as patchRecurring } from "@/app/api/households/[id]/recurring/[recurringId]/route";
import { ensureTemplateGenerated } from "@/lib/recurring-generator";
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

function isoMonthStart(offsetMonths: number, from: Date): string {
  const d = new Date(from.getFullYear(), from.getMonth() + offsetMonths, 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

describe("Scenario 4: a new member is added to future recurring generation via override, past months untouched", () => {
  afterAll(cleanupTracked);

  it("keeps already-generated months on the old split and only applies the new member to future months", async () => {
    const now = new Date();
    const alice = await createTestUser({ name: "Alice" });
    const bob = await createTestUser({ name: "Bob" });
    const charlie = await createTestUser({ name: "Charlie" });
    trackUser(alice.id);
    trackUser(bob.id);
    trackUser(charlie.id);

    await mockSessionAs(alice);
    const createRes = await createHousehold(
      jsonRequest("http://test/api/households", "POST", {
        name: `${TEST_HOUSEHOLD_PREFIX}Birchwood Apartment`,
        householdType: "RECURRING",
      })
    );
    expect(createRes.status).toBe(201);
    const { household } = await asJson<{ household: { id: string; inviteCode: string } }>(createRes);
    trackHousehold(household.id);

    await mockSessionAs(bob);
    await joinHousehold(jsonRequest("http://test/api/households/join", "POST", { inviteCode: household.inviteCode }));

    // Alice sets the household's default recurring split to 60/40 Alice/Bob.
    await mockSessionAs(alice);
    const membersPatchRes = await patchMembers(
      jsonRequest(`http://test/api/households/${household.id}/members`, "PATCH", {
        updates: [
          { userId: alice.id, defaultSplitPercent: 60 },
          { userId: bob.id, defaultSplitPercent: 40 },
        ],
      }),
      paramsOf({ id: household.id })
    );
    expect(membersPatchRes.status).toBe(200);

    // Create a "Rent" template starting 2 months ago; creation backfills every
    // due month up to today (dayOfMonth=1 is always due), so this yields 3
    // real Expense rows split 60/40, with no overrides yet.
    const startDate = isoMonthStart(-2, now);
    const recurringRes = await createRecurring(
      jsonRequest(`http://test/api/households/${household.id}/recurring`, "POST", {
        title: "Rent",
        amount: 1000,
        dayOfMonth: 1,
        paidBy: alice.id,
        splitType: "PERCENT",
        startDate,
        overrides: [],
      }),
      paramsOf({ id: household.id })
    );
    expect(recurringRes.status).toBe(201);
    const { recurring } = await asJson<{ recurring: { id: string } }>(recurringRes);

    const generatedBefore = await prisma.expense.findMany({
      where: { recurringId: recurring.id },
      include: { splits: true },
      orderBy: { date: "asc" },
    });
    expect(generatedBefore).toHaveLength(3);
    for (const expense of generatedBefore) {
      expect(expense.splits).toHaveLength(2);
      const byUser = Object.fromEntries(expense.splits.map((s) => [s.userId, Number(s.amountOwed)]));
      expect(byUser[alice.id]).toBe(600);
      expect(byUser[bob.id]).toBe(400);
    }

    // Charlie joins the household after those months were already generated.
    await mockSessionAs(charlie);
    await joinHousehold(jsonRequest("http://test/api/households/join", "POST", { inviteCode: household.inviteCode }));

    // Alice edits the template, adding an override so Charlie is included
    // going forward: Alice 50% / Bob 30% / Charlie 20%.
    await mockSessionAs(alice);
    const templatePatchRes = await patchRecurring(
      jsonRequest(`http://test/api/households/${household.id}/recurring/${recurring.id}`, "PATCH", {
        title: "Rent",
        amount: 1000,
        dayOfMonth: 1,
        paidBy: alice.id,
        splitType: "PERCENT",
        startDate,
        active: true,
        overrides: [
          { userId: alice.id, percent: 50 },
          { userId: bob.id, percent: 30 },
          { userId: charlie.id, percent: 20 },
        ],
      }),
      paramsOf({ id: household.id, recurringId: recurring.id })
    );
    expect(templatePatchRes.status).toBe(200);

    // The already-generated months are untouched: still 3 rows, still 60/40 Alice/Bob.
    const generatedAfterPatch = await prisma.expense.findMany({
      where: { recurringId: recurring.id },
      include: { splits: true },
    });
    expect(generatedAfterPatch).toHaveLength(3);
    for (const expense of generatedAfterPatch) {
      expect(expense.splits).toHaveLength(2);
    }

    // Simulate the next month arriving: generation now picks up the new override.
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const createdCount = await ensureTemplateGenerated(recurring.id, nextMonth);
    expect(createdCount).toBe(1);

    const allGenerated = await prisma.expense.findMany({
      where: { recurringId: recurring.id },
      include: { splits: true },
      orderBy: { date: "asc" },
    });
    expect(allGenerated).toHaveLength(4);
    const futureExpense = allGenerated[3];
    expect(futureExpense.splits).toHaveLength(3);
    const byUser = Object.fromEntries(futureExpense.splits.map((s) => [s.userId, Number(s.amountOwed)]));
    expect(byUser[alice.id]).toBe(500);
    expect(byUser[bob.id]).toBe(300);
    expect(byUser[charlie.id]).toBe(200);
  });
});
