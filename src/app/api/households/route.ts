import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateInviteCode } from "@/lib/household-access";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  householdType: z.enum(["RECURRING", "EVENT"]),
  currency: z.enum(["USD", "SEK"]).optional().default("USD"),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.householdMember.findMany({
    where: { userId: session.user.id, leftAt: null },
    include: {
      household: {
        include: { _count: { select: { members: { where: { leftAt: null } } } } },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const households = memberships.map((m) => ({
    id: m.household.id,
    name: m.household.name,
    householdType: m.household.householdType,
    currency: m.household.currency,
    inviteCode: m.household.inviteCode,
    role: m.role,
    memberCount: m.household._count.members,
  }));

  return NextResponse.json({ households });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let inviteCode = generateInviteCode();
  for (let attempts = 0; attempts < 5; attempts++) {
    const existing = await prisma.household.findUnique({ where: { inviteCode } });
    if (!existing) break;
    inviteCode = generateInviteCode();
  }

  const household = await prisma.household.create({
    data: {
      name: parsed.data.name,
      householdType: parsed.data.householdType,
      currency: parsed.data.currency,
      inviteCode,
      createdBy: session.user.id,
      members: {
        create: {
          userId: session.user.id,
          role: "ADMIN",
          defaultSplitPercent: parsed.data.householdType === "RECURRING" ? 100 : null,
        },
      },
    },
  });

  return NextResponse.json({ household }, { status: 201 });
}
