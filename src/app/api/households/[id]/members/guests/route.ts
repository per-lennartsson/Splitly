import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireAdmin } from "@/lib/household-access";

const createGuestSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireAdmin(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const household = await prisma.household.findUnique({ where: { id: params.id } });
  if (!household) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (household.householdType !== "EVENT") {
    return NextResponse.json({ error: "Guests can only be added to event groups." }, { status: 400 });
  }

  const parsed = createGuestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Guests never log in: a random, never-revealed password hash is a belt-and-suspenders
  // backup to the isPlaceholder check in src/lib/auth.ts's authorize() callback.
  const passwordHash = await bcrypt.hash(randomUUID(), 12);

  const member = await prisma.$transaction(async (tx) => {
    const guestUser = await tx.user.create({
      data: {
        email: `guest-${randomUUID()}@splitly.invalid`,
        passwordHash,
        name: parsed.data.name,
        isPlaceholder: true,
      },
    });
    return tx.householdMember.create({
      data: { householdId: params.id, userId: guestUser.id, role: "MEMBER", defaultSplitPercent: null },
      include: { user: { select: { id: true, name: true, email: true, isPlaceholder: true } } },
    });
  });

  return NextResponse.json(
    {
      member: {
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        isPlaceholder: member.user.isPlaceholder,
      },
    },
    { status: 201 }
  );
}
