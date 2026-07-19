import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

export class ForbiddenError extends Error {}

/** Returns the caller's active membership in a household, or throws ForbiddenError. */
export async function requireMembership(householdId: string, userId: string) {
  const membership = await prisma.householdMember.findFirst({
    where: { householdId, userId, leftAt: null },
  });
  if (!membership) throw new ForbiddenError("Not a member of this household.");
  return membership;
}

export async function requireAdmin(householdId: string, userId: string) {
  const membership = await requireMembership(householdId, userId);
  if (membership.role !== "ADMIN") throw new ForbiddenError("Admin access required.");
  return membership;
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}
