import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";

const createSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: z.number().positive(),
  note: z.string().max(500).nullable().optional(),
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

  const settlements = await prisma.settlement.findMany({
    where: { householdId: params.id },
    include: { fromUser: { select: { name: true } }, toUser: { select: { name: true } } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ settlements });
}

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireMembership(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (input.fromUserId === input.toUserId) {
    return NextResponse.json({ error: "Cannot settle up with yourself." }, { status: 400 });
  }

  const activeMembers = await prisma.householdMember.findMany({
    where: { householdId: params.id, leftAt: null },
  });
  const activeIds = new Set(activeMembers.map((m) => m.userId));
  if (!activeIds.has(input.fromUserId) || !activeIds.has(input.toUserId)) {
    return NextResponse.json({ error: "Both parties must be active household members." }, { status: 400 });
  }

  const settlement = await prisma.settlement.create({
    data: {
      householdId: params.id,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amount: input.amount,
      note: input.note ?? null,
    },
  });

  return NextResponse.json({ settlement }, { status: 201 });
}
