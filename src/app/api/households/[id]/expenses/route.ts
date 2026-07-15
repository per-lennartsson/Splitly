import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";
import { expenseInputSchema } from "@/lib/expense-schema";
import { ExpenseValidationError, resolveExpenseSplits } from "@/lib/expense-service";

export async function GET(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireMembership(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM
  const categoryId = searchParams.get("categoryId");

  let dateFilter: { gte: Date; lt: Date } | undefined;
  if (month) {
    const [year, m] = month.split("-").map(Number);
    dateFilter = { gte: new Date(year, m - 1, 1), lt: new Date(year, m, 1) };
  }

  const expenses = await prisma.expense.findMany({
    where: {
      householdId: params.id,
      deletedAt: null,
      ...(dateFilter ? { date: dateFilter } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
    include: {
      splits: true,
      category: true,
      payer: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json({ expenses });
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

  const expense = await prisma.expense.create({
    data: {
      householdId: params.id,
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

  return NextResponse.json({ expense }, { status: 201 });
}
