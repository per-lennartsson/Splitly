import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CategoryManager } from "@/components/category-manager";

export default async function CategoriesPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
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
  const dateFilter =
    household.householdType === "RECURRING"
      ? {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
          lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        }
      : undefined;

  const spendByCategory = await prisma.expense.groupBy({
    by: ["categoryId"],
    where: {
      householdId: params.id,
      deletedAt: null,
      categoryId: { not: null },
      ...(dateFilter ? { date: dateFilter } : {}),
    },
    _sum: { amount: true },
  });

  const spendMap = Object.fromEntries(
    spendByCategory.map((s) => [s.categoryId as string, Number(s._sum.amount ?? 0)])
  );

  return (
    <CategoryManager
      householdId={params.id}
      householdType={household.householdType}
      currency={household.currency}
      locale={session.user.locale}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        budgetLimit: c.budgetLimit ? Number(c.budgetLimit) : null,
        color: c.color,
        spent: spendMap[c.id] ?? 0,
      }))}
    />
  );
}
