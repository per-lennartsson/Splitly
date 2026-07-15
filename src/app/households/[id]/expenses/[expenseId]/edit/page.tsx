import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ExpenseForm } from "@/components/expense-form";
import { t } from "@/lib/i18n/t";

export default async function EditExpensePage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; expenseId: string }>;
}) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const household = await prisma.household.findFirst({
    where: { id: params.id, members: { some: { userId: session.user.id, leftAt: null } } },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { joinedAt: "asc" },
      },
      categories: { orderBy: { name: "asc" } },
    },
  });
  if (!household) redirect("/households");

  const expense = await prisma.expense.findFirst({
    where: { id: params.expenseId, householdId: params.id, deletedAt: null },
    include: { splits: true },
  });
  if (!expense) redirect(`/households/${params.id}/expenses`);

  const locale = session.user.locale;

  return (
    <div>
      <Link href={`/households/${params.id}/expenses`} className="text-sm text-slate-500 hover:text-slate-700">
        {t(locale, "common.back")}
      </Link>
      <h2 className="mb-6 mt-2 text-lg font-semibold text-slate-900">{t(locale, "expenseForm.editTitle")}</h2>
      <ExpenseForm
        householdId={params.id}
        members={household.members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          defaultSplitPercent: m.defaultSplitPercent ? Number(m.defaultSplitPercent) : null,
        }))}
        categories={household.categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
        currency={household.currency}
        locale={locale}
        initial={{
          id: expense.id,
          title: expense.title,
          amount: Number(expense.amount),
          categoryId: expense.categoryId,
          paidBy: expense.paidBy,
          date: expense.date.toISOString().slice(0, 10),
          splitType: expense.splitType,
          notes: expense.notes ?? "",
          splits: expense.splits.map((s) => ({
            userId: s.userId,
            percent: s.percent ? Number(s.percent) : null,
            amountOwed: Number(s.amountOwed),
          })),
        }}
      />
    </div>
  );
}
