import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";

/**
 * Marks a recurring template as reviewed — resets the review clock without
 * touching any other field. Used by the "still accurate?" prompt on the
 * recurring list page.
 */
export async function POST(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; recurringId: string }> }
) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireMembership(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const existing = await prisma.recurringExpense.findFirst({
    where: { id: params.recurringId, householdId: params.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recurring = await prisma.recurringExpense.update({
    where: { id: params.recurringId },
    data: { lastConfirmedAt: new Date() },
  });

  return NextResponse.json({ recurring });
}
