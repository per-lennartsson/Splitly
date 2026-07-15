import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RecurringForm } from "@/components/recurring-form";
import { t } from "@/lib/i18n/t";

export default async function EditRecurringPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string; recurringId: string }>;
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
  if (!household || household.householdType !== "RECURRING") redirect("/households");

  const recurring = await prisma.recurringExpense.findFirst({
    where: { id: params.recurringId, householdId: params.id },
    include: { overrides: true },
  });
  if (!recurring) redirect(`/households/${params.id}/recurring`);

  const locale = session.user.locale;

  return (
    <div>
      <Link href={`/households/${params.id}/recurring`} className="text-sm text-slate-500 hover:text-slate-700">
        {t(locale, "common.back")}
      </Link>
      <h2 className="mb-6 mt-2 text-lg font-semibold text-slate-900">{t(locale, "recurringForm.editTitle")}</h2>
      <RecurringForm
        householdId={params.id}
        members={household.members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          defaultSplitPercent: m.defaultSplitPercent ? Number(m.defaultSplitPercent) : null,
        }))}
        categories={household.categories.map((c) => ({ id: c.id, name: c.name }))}
        currency={household.currency}
        locale={locale}
        initial={{
          id: recurring.id,
          title: recurring.title,
          amount: Number(recurring.amount),
          categoryId: recurring.categoryId,
          dayOfMonth: recurring.dayOfMonth,
          paidBy: recurring.paidBy,
          splitType: recurring.splitType,
          startDate: recurring.startDate.toISOString().slice(0, 10),
          endDate: recurring.endDate ? recurring.endDate.toISOString().slice(0, 10) : null,
          active: recurring.active,
          overrides: recurring.overrides.map((o) => ({
            userId: o.userId,
            percent: o.percent ? Number(o.percent) : null,
            amountOwed: o.amountOwed ? Number(o.amountOwed) : null,
          })),
        }}
      />
    </div>
  );
}
