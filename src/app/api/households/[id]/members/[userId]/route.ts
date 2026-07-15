import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";

export async function DELETE(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let membership;
  try {
    membership = await requireMembership(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const isSelf = params.userId === session.user.id;
  if (!isSelf && membership.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required to remove other members." }, { status: 403 });
  }

  const target = await prisma.householdMember.findFirst({
    where: { householdId: params.id, userId: params.userId, leftAt: null },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.role === "ADMIN") {
    const otherAdmins = await prisma.householdMember.count({
      where: { householdId: params.id, role: "ADMIN", leftAt: null, userId: { not: params.userId } },
    });
    if (otherAdmins === 0) {
      return NextResponse.json(
        { error: "Cannot remove the last admin. Promote another member first." },
        { status: 400 }
      );
    }
  }

  await prisma.householdMember.update({
    where: { id: target.id },
    data: { leftAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
