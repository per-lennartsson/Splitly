import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireMembership } from "@/lib/household-access";
import { recurringInputSchema } from "@/lib/recurring-schema";
import { RecurringValidationError, validateRecurringSplit } from "@/lib/recurring-service";
import { ensureTemplateGenerated } from "@/lib/recurring-generator";

export async function PATCH(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; recurringId: string }> }
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

  const existing = await prisma.recurringExpense.findFirst({
    where: { id: params.recurringId, householdId: params.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Pause/resume-only updates skip full re-validation.
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    const recurring = await prisma.recurringExpense.update({
      where: { id: params.recurringId },
      data: { active: body.active },
      include: { overrides: true },
    });
    if (body.active) {
      await ensureTemplateGenerated(recurring.id);
    }
    return NextResponse.json({ recurring });
  }

  const parsed = recurringInputSchema.safeParse(body);
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

  // This only ever changes the template, which future projections and the
  // next-generated Expense will pick up — already-generated actual Expense
  // rows for past months are untouched historical records. A full-form edit
  // counts as a confirmation the amount is still accurate, so it also resets
  // the review clock.
  const recurring = await prisma.$transaction(async (tx) => {
    await tx.recurringSplitOverride.deleteMany({ where: { recurringId: params.recurringId } });
    return tx.recurringExpense.update({
      where: { id: params.recurringId },
      data: {
        title: input.title,
        amount: input.amount,
        categoryId: input.categoryId ?? null,
        dayOfMonth: input.dayOfMonth,
        paidBy: input.paidBy,
        splitType: input.splitType,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        active: input.active ?? existing.active,
        lastConfirmedAt: new Date(),
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
  });

  // Covers day_of_month moving earlier, or reactivating via the full form.
  if (recurring.active) {
    await ensureTemplateGenerated(recurring.id);
  }

  return NextResponse.json({ recurring });
}

export async function DELETE(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; recurringId: string }> }
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

  const existing = await prisma.recurringExpense.findFirst({
    where: { id: params.recurringId, householdId: params.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Templates with already-generated expenses are deactivated rather than
  // deleted, since Expense.recurringId is a real FK to this row and those
  // generated rows must remain as historical record.
  const hasGenerated = await prisma.expense.findFirst({ where: { recurringId: params.recurringId } });
  if (hasGenerated) {
    await prisma.recurringExpense.update({ where: { id: params.recurringId }, data: { active: false } });
    return NextResponse.json({ ok: true, deactivated: true });
  }

  await prisma.recurringExpense.delete({ where: { id: params.recurringId } });
  return NextResponse.json({ ok: true, deleted: true });
}
