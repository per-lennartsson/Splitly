import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** How long a generated guest claim link stays valid. */
export const CLAIM_TOKEN_TTL_DAYS = 30;

export type GuestClaimErrorCode = "NOT_A_GUEST" | "INVALID" | "EXPIRED" | "NOT_ALLOWED";

export class GuestClaimError extends Error {
  constructor(public code: GuestClaimErrorCode, message: string) {
    super(message);
  }
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isExpired(createdAt: Date | null, now: Date): boolean {
  if (!createdAt) return true;
  return now.getTime() - createdAt.getTime() > CLAIM_TOKEN_TTL_DAYS * 86_400_000;
}

/**
 * Issues a fresh single-use claim token for a guest in a household, replacing
 * any previous one. Only the hash is stored; the raw token is returned once.
 */
export async function issueClaimToken(householdId: string, guestUserId: string): Promise<string> {
  const membership = await prisma.householdMember.findFirst({
    where: { householdId, userId: guestUserId, leftAt: null },
    include: { user: { select: { isPlaceholder: true } } },
  });
  if (!membership || !membership.user.isPlaceholder) {
    throw new GuestClaimError("NOT_A_GUEST", "Only active guests can be invited to claim their spot.");
  }

  const token = randomBytes(24).toString("base64url");
  await prisma.householdMember.update({
    where: { id: membership.id },
    data: { claimTokenHash: hashClaimToken(token), claimTokenCreatedAt: new Date() },
  });
  return token;
}

export interface ClaimPreview {
  householdId: string;
  householdName: string;
  guestName: string;
}

/** Looks up what a claim token points to, or throws GuestClaimError if it can't be used. */
export async function getClaimPreview(token: string, now = new Date()): Promise<ClaimPreview> {
  const membership = await prisma.householdMember.findUnique({
    where: { claimTokenHash: hashClaimToken(token) },
    include: {
      user: { select: { name: true, isPlaceholder: true } },
      household: { select: { id: true, name: true } },
    },
  });
  if (!membership || membership.leftAt !== null || !membership.user.isPlaceholder) {
    throw new GuestClaimError("INVALID", "This invite link is invalid or has already been used.");
  }
  if (isExpired(membership.claimTokenCreatedAt, now)) {
    throw new GuestClaimError("EXPIRED", "This invite link has expired. Ask the group admin for a new one.");
  }
  return {
    householdId: membership.household.id,
    householdName: membership.household.name,
    guestName: membership.user.name,
  };
}

function addDecimals(a: Prisma.Decimal | null, b: Prisma.Decimal | null): Prisma.Decimal | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.plus(b);
}

/**
 * Merges a guest (placeholder user) into a real account: every expense, split,
 * settlement and recurring row that referenced the guest is re-pointed at the
 * real user, the membership is handed over, and the placeholder user is deleted.
 *
 * Collisions (the real user is already on the same expense as the guest) are
 * resolved by summing the two shares; settlements that become self-payments
 * are dropped. Net balances are unchanged by construction.
 */
export async function claimGuest(token: string, realUserId: string, now = new Date()): Promise<{ householdId: string }> {
  return prisma.$transaction(async (tx) => {
    const guestMembership = await tx.householdMember.findUnique({
      where: { claimTokenHash: hashClaimToken(token) },
      include: { user: { select: { id: true, isPlaceholder: true } } },
    });
    if (!guestMembership || guestMembership.leftAt !== null || !guestMembership.user.isPlaceholder) {
      throw new GuestClaimError("INVALID", "This invite link is invalid or has already been used.");
    }
    if (isExpired(guestMembership.claimTokenCreatedAt, now)) {
      throw new GuestClaimError("EXPIRED", "This invite link has expired. Ask the group admin for a new one.");
    }

    const realUser = await tx.user.findUnique({ where: { id: realUserId } });
    if (!realUser || realUser.isPlaceholder) {
      throw new GuestClaimError("NOT_ALLOWED", "You need a real account to claim a guest.");
    }

    const guestId = guestMembership.user.id;
    const householdId = guestMembership.householdId;

    // Expenses and recurring templates the guest paid.
    await tx.expense.updateMany({ where: { householdId, paidBy: guestId }, data: { paidBy: realUserId } });
    await tx.recurringExpense.updateMany({ where: { householdId, paidBy: guestId }, data: { paidBy: realUserId } });

    // Expense splits: move, or sum into the real user's existing split on the same expense.
    const guestSplits = await tx.expenseSplit.findMany({ where: { userId: guestId } });
    if (guestSplits.length > 0) {
      const userSplits = await tx.expenseSplit.findMany({
        where: { userId: realUserId, expenseId: { in: guestSplits.map((s) => s.expenseId) } },
      });
      const userSplitByExpense = new Map(userSplits.map((s) => [s.expenseId, s]));
      for (const split of guestSplits) {
        const existing = userSplitByExpense.get(split.expenseId);
        if (existing) {
          await tx.expenseSplit.update({
            where: { id: existing.id },
            data: {
              amountOwed: existing.amountOwed.plus(split.amountOwed),
              percent: addDecimals(existing.percent, split.percent),
            },
          });
          await tx.expenseSplit.delete({ where: { id: split.id } });
        } else {
          await tx.expenseSplit.update({ where: { id: split.id }, data: { userId: realUserId } });
        }
      }
    }

    // Recurring split overrides: same move-or-sum rule.
    const guestOverrides = await tx.recurringSplitOverride.findMany({ where: { userId: guestId } });
    if (guestOverrides.length > 0) {
      const userOverrides = await tx.recurringSplitOverride.findMany({
        where: { userId: realUserId, recurringId: { in: guestOverrides.map((o) => o.recurringId) } },
      });
      const userOverrideByRecurring = new Map(userOverrides.map((o) => [o.recurringId, o]));
      for (const override of guestOverrides) {
        const existing = userOverrideByRecurring.get(override.recurringId);
        if (existing) {
          await tx.recurringSplitOverride.update({
            where: { id: existing.id },
            data: {
              amountOwed: addDecimals(existing.amountOwed, override.amountOwed),
              percent: addDecimals(existing.percent, override.percent),
            },
          });
          await tx.recurringSplitOverride.delete({ where: { id: override.id } });
        } else {
          await tx.recurringSplitOverride.update({ where: { id: override.id }, data: { userId: realUserId } });
        }
      }
    }

    // Settlements: re-point both sides, then drop any that became self-payments.
    await tx.settlement.updateMany({ where: { householdId, fromUserId: guestId }, data: { fromUserId: realUserId } });
    await tx.settlement.updateMany({ where: { householdId, toUserId: guestId }, data: { toUserId: realUserId } });
    await tx.settlement.deleteMany({ where: { householdId, fromUserId: realUserId, toUserId: realUserId } });

    // Membership: hand the guest's spot over, or reuse the real user's existing one.
    const userMembership = await tx.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId: realUserId } },
    });
    if (!userMembership) {
      await tx.householdMember.update({
        where: { id: guestMembership.id },
        data: { userId: realUserId, claimTokenHash: null, claimTokenCreatedAt: null },
      });
    } else {
      if (userMembership.leftAt !== null) {
        await tx.householdMember.update({ where: { id: userMembership.id }, data: { leftAt: null } });
      }
      await tx.householdMember.delete({ where: { id: guestMembership.id } });
    }

    // Nothing references the placeholder anymore.
    await tx.user.delete({ where: { id: guestId } });

    return { householdId };
  });
}
