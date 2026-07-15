import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";
import { expenseInputSchema } from "@/lib/expense-schema";
import { ExpenseValidationError, resolveExpenseSplits } from "@/lib/expense-service";

export async function GET(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; expenseId: string }> }
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

  const expense = await prisma.expense.findFirst({
    where: { id: params.expenseId, householdId: params.id, deletedAt: null },
    include: { splits: true, category: true, payer: { select: { id: true, name: true } } },
  });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ expense });
}

export async function PATCH(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; expenseId: string }> }
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

  const existing = await prisma.expense.findFirst({
    where: { id: params.expenseId, householdId: params.id, deletedAt: null },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = expenseInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const activeMembers = await prisma.householdMember.findMany({
    where: { householdId: params.id, leftAt: null },
  });
  const activeMemberIds = new Set(activeMembers.map((m) => m.userId));

  if (!activeMemberIds.has(input.paidBy)) {
    return NextResponse.json({ error: "paidBy must be an active household member." }, { status: 400 });
  }

  let resolvedSplits;
  try {
    resolvedSplits = resolveExpenseSplits(input, activeMemberIds);
  } catch (e) {
    if (e instanceof ExpenseValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, householdId: params.id },
    });
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 400 });
  }

  const expense = await prisma.$transaction(async (tx) => {
    await tx.expenseSplit.deleteMany({ where: { expenseId: params.expenseId } });
    return tx.expense.update({
      where: { id: params.expenseId },
      data: {
        title: input.title,
        amount: input.amount,
        categoryId: input.categoryId ?? null,
        paidBy: input.paidBy,
        date: new Date(input.date),
        splitType: input.splitType,
        notes: input.notes ?? null,
        splits: {
          create: resolvedSplits.map((s) => ({
            userId: s.userId,
            percent: s.percent,
            amountOwed: s.amountOwed,
          })),
        },
      },
      include: { splits: true },
    });
  });

  return NextResponse.json({ expense });
}

export async function DELETE(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; expenseId: string }> }
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

  const existing = await prisma.expense.findFirst({
    where: { id: params.expenseId, householdId: params.id, deletedAt: null },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft delete: history and past balances remain reconstructable, and the
  // balance engine simply excludes it since it always filters deletedAt: null.
  await prisma.expense.update({
    where: { id: params.expenseId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
