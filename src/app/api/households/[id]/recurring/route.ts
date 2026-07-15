import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";
import { recurringInputSchema } from "@/lib/recurring-schema";
import { RecurringValidationError, validateRecurringSplit } from "@/lib/recurring-service";
import { ensureTemplateGenerated } from "@/lib/recurring-generator";

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

  const household = await prisma.household.findUnique({ where: { id: params.id } });
  if (household?.householdType !== "RECURRING") {
    return NextResponse.json({ error: "Recurring expenses are only available for recurring households." }, { status: 400 });
  }

  const recurring = await prisma.recurringExpense.findMany({
    where: { householdId: params.id },
    include: { overrides: true, category: true, payer: { select: { id: true, name: true } } },
    orderBy: { dayOfMonth: "asc" },
  });

  return NextResponse.json({ recurring });
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

  const household = await prisma.household.findUnique({ where: { id: params.id } });
  if (household?.householdType !== "RECURRING") {
    return NextResponse.json({ error: "Recurring expenses are only available for recurring households." }, { status: 400 });
  }

  const parsed = recurringInputSchema.safeParse(await req.json());
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

  try {
    validateRecurringSplit(
      input,
      activeMembers.map((m) => ({
        userId: m.userId,
        defaultSplitPercent: m.defaultSplitPercent ? Number(m.defaultSplitPercent) : null,
      }))
    );
  } catch (e) {
    if (e instanceof RecurringValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, householdId: params.id } });
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 400 });
  }

  const recurring = await prisma.recurringExpense.create({
    data: {
      householdId: params.id,
      title: input.title,
      amount: input.amount,
      categoryId: input.categoryId ?? null,
      dayOfMonth: input.dayOfMonth,
      paidBy: input.paidBy,
      splitType: input.splitType,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      active: input.active ?? true,
      overrides: {
        create: input.overrides.map((o) => ({
          userId: o.userId,
          percent: o.percent ?? null,
          amountOwed: o.amountOwed ?? null,
        })),
      },
    },
    include: { overrides: true },
  });

  if (recurring.active) {
    await ensureTemplateGenerated(recurring.id);
  }

  return NextResponse.json({ recurring }, { status: 201 });
}
