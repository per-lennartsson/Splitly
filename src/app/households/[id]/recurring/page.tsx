import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RecurringList } from "@/components/recurring-list";
import { isReviewOverdue } from "@/lib/recurring-review";

export default async function RecurringPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const household = await prisma.household.findFirst({
    where: { id: params.id, members: { some: { userId: session.user.id, leftAt: null } } },
  });
  if (!household) redirect("/households");
  if (household.householdType !== "RECURRING") redirect(`/households/${params.id}/dashboard`);

  const recurring = await prisma.recurringExpense.findMany({
    where: { householdId: params.id },
    include: { category: true, payer: { select: { name: true } } },
    orderBy: { dayOfMonth: "asc" },
  });

  const now = new Date();

  return (
    <RecurringList
      householdId={params.id}
      currency={household.currency}
      locale={session.user.locale}
      items={recurring.map((r) => ({
        id: r.id,
        title: r.title,
        amount: Number(r.amount),
        categoryName: r.category?.name ?? null,
        categoryColor: r.category?.color ?? null,
        dayOfMonth: r.dayOfMonth,
        payerName: r.payer.name,
        splitType: r.splitType,
        active: r.active,
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
        reviewDue: r.active && isReviewOverdue(r.lastConfirmedAt, r.reviewIntervalMonths, now),
      }))}
    />
  );
}
