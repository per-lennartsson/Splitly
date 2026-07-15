import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExpenseList, type ExpenseVM } from "@/components/expense-list";
import { getProjectedExpenses } from "@/lib/projected-expenses";
import { ensureRecurringGenerated } from "@/lib/recurring-generator";
import { isSameOrFutureMonth } from "@/lib/date-utils";

export default async function ExpensesPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const [params, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const household = await prisma.household.findFirst({
    where: { id: params.id, members: { some: { userId: session.user.id, leftAt: null } } },
  });
  if (!household) redirect("/households");

  const categories = await prisma.category.findMany({
    where: { householdId: params.id },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const isRecurring = household.householdType === "RECURRING";

  let expenseVMs: ExpenseVM[] = [];
  let monthNav: { year: number; monthIndex0: number; isCurrentOrPast: boolean } | undefined;

  if (isRecurring) {
    // Catches up any due-but-ungenerated recurring expenses before reading —
    // replaces the nightly cron with generation-on-visit.
    await ensureRecurringGenerated(params.id, now);

    const year = searchParams.y ? Number(searchParams.y) : now.getFullYear();
    const monthIndex0 = searchParams.m ? Number(searchParams.m) : now.getMonth();
    const monthStart = new Date(year, monthIndex0, 1);
    const monthEnd = new Date(year, monthIndex0 + 1, 1);

    const actual = await prisma.expense.findMany({
      where: { householdId: params.id, deletedAt: null, date: { gte: monthStart, lt: monthEnd } },
      include: { category: true, payer: { select: { name: true } } },
      orderBy: { date: "desc" },
    });

    const showProjections = isSameOrFutureMonth(year, monthIndex0, now.getFullYear(), now.getMonth());
    const projected = showProjections ? await getProjectedExpenses(params.id, year, monthIndex0) : [];

    const memberNames = Object.fromEntries(
      (
        await prisma.householdMember.findMany({
          where: { householdId: params.id, leftAt: null },
          include: { user: { select: { name: true } } },
        })
      ).map((m) => [m.userId, m.user.name])
    );
    const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

    expenseVMs = [
      ...actual.map((e) => ({
        id: e.id,
        title: e.title,
        amount: Number(e.amount),
        categoryId: e.categoryId,
        categoryName: e.category?.name ?? null,
        categoryColor: e.category?.color ?? null,
        paidByName: e.payer.name,
        date: e.date.toISOString().slice(0, 10),
        projected: false,
      })),
      ...projected.map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        categoryId: e.categoryId,
        categoryName: e.categoryId ? categoryMap[e.categoryId]?.name ?? null : null,
        categoryColor: e.categoryId ? categoryMap[e.categoryId]?.color ?? null : null,
        paidByName: memberNames[e.paidBy] ?? "Unknown",
        date: e.date.toISOString().slice(0, 10),
        projected: true,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    monthNav = {
      year,
      monthIndex0,
      isCurrentOrPast: !isSameOrFutureMonth(year, monthIndex0, now.getFullYear(), now.getMonth() + 1),
    };
  } else {
    const actual = await prisma.expense.findMany({
      where: { householdId: params.id, deletedAt: null },
      include: { category: true, payer: { select: { name: true } } },
      orderBy: { date: "desc" },
    });
    expenseVMs = actual.map((e) => ({
      id: e.id,
      title: e.title,
      amount: Number(e.amount),
      categoryId: e.categoryId,
      categoryName: e.category?.name ?? null,
      categoryColor: e.category?.color ?? null,
      paidByName: e.payer.name,
      date: e.date.toISOString().slice(0, 10),
      projected: false,
    }));
  }

  return (
    <ExpenseList
      householdId={params.id}
      householdType={household.householdType}
      currency={household.currency}
      locale={session.user.locale}
      expenses={expenseVMs}
      categories={categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      monthNav={monthNav}
    />
  );
}
