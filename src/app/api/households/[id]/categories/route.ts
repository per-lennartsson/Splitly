import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  budgetLimit: z.number().positive().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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

  const categories = await prisma.category.findMany({
    where: { householdId: params.id },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ categories });
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

  const existing = await prisma.category.findUnique({
    where: { householdId_name: { householdId: params.id, name: parsed.data.name } },
  });
  if (existing) {
    return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 });
  }

  const category = await prisma.category.create({
    data: {
      householdId: params.id,
      name: parsed.data.name,
      budgetLimit: parsed.data.budgetLimit ?? null,
      color: parsed.data.color ?? "#6366f1",
    },
  });

  return NextResponse.json({ category }, { status: 201 });
}
