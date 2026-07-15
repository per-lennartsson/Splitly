import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  budgetLimit: z.number().positive().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function PATCH(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; categoryId: string }> }
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

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const category = await prisma.category.findFirst({
    where: { id: params.categoryId, householdId: params.id },
  });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.category.update({
    where: { id: category.id },
    data: parsed.data,
  });

  return NextResponse.json({ category: updated });
}

export async function DELETE(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; categoryId: string }> }
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

  const category = await prisma.category.findFirst({
    where: { id: params.categoryId, householdId: params.id },
  });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Expenses referencing this category keep their historical categoryId link;
  // detach it so the FK doesn't block deletion of the category itself.
  await prisma.$transaction([
    prisma.expense.updateMany({ where: { categoryId: category.id }, data: { categoryId: null } }),
    prisma.recurringExpense.updateMany({ where: { categoryId: category.id }, data: { categoryId: null } }),
    prisma.category.delete({ where: { id: category.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
