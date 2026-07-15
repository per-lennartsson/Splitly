import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const joinSchema = z.object({ inviteCode: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = joinSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const household = await prisma.household.findUnique({
    where: { inviteCode: parsed.data.inviteCode.toUpperCase().trim() },
  });
  if (!household) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 404 });
  }

  const existing = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: household.id, userId: session.user.id } },
  });

  if (existing) {
    if (existing.leftAt === null) {
      return NextResponse.json({ error: "You're already a member of this household." }, { status: 409 });
    }
    const rejoined = await prisma.householdMember.update({
      where: { id: existing.id },
      data: { leftAt: null, defaultSplitPercent: null },
    });
    return NextResponse.json({ household, membership: rejoined }, { status: 200 });
  }

  const membership = await prisma.householdMember.create({
    data: {
      householdId: household.id,
      userId: session.user.id,
      role: "MEMBER",
      defaultSplitPercent: household.householdType === "RECURRING" ? 0 : null,
    },
  });

  return NextResponse.json({ household, membership }, { status: 201 });
}
