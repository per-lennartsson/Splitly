import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireAdmin, requireMembership } from "@/lib/household-access";
import { validatePercentTotal } from "@/lib/split-calculator";

const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        userId: z.string(),
        defaultSplitPercent: z.number().min(0).max(100),
      })
    )
    .min(1),
});

export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireMembership(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const members = await prisma.householdMember.findMany({
    where: { householdId: params.id, leftAt: null },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({ members });
}

export async function PATCH(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireAdmin(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const household = await prisma.household.findUnique({ where: { id: params.id } });
  if (!household) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentMembers = await prisma.householdMember.findMany({
    where: { householdId: params.id, leftAt: null },
  });

  const updateMap = new Map(parsed.data.updates.map((u) => [u.userId, u.defaultSplitPercent]));
  const validUserIds = new Set(currentMembers.map((m) => m.userId));
  for (const userId of updateMap.keys()) {
    if (!validUserIds.has(userId)) {
      return NextResponse.json({ error: `${userId} is not an active member.` }, { status: 400 });
    }
  }

  if (household.householdType === "RECURRING") {
    const resulting = currentMembers.map((m) => ({
      userId: m.userId,
      percent: updateMap.get(m.userId) ?? Number(m.defaultSplitPercent ?? 0),
    }));
    if (!validatePercentTotal(resulting)) {
      return NextResponse.json(
        { error: "Default split percentages across all members must total 100%." },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction(
    parsed.data.updates.map((u) =>
      prisma.householdMember.update({
        where: { householdId_userId: { householdId: params.id, userId: u.userId } },
        data: { defaultSplitPercent: u.defaultSplitPercent },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
