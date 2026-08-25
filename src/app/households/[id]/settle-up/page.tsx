import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdBalances } from "@/lib/household-balances";
import { SettleUpView } from "@/components/settle-up-view";

export default async function SettleUpPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const household = await prisma.household.findFirst({
    where: { id: params.id, members: { some: { userId: session.user.id, leftAt: null } } },
  });
  if (!household) redirect("/households");

  // Not scoped to active membership (no `leftAt: null`): balances include
  // historical splits from members who've since left, and their name must
  // still resolve rather than falling back to "Unknown".
  const members = await prisma.householdMember.findMany({
    where: { householdId: params.id },
    include: { user: { select: { id: true, name: true, isPlaceholder: true } } },
  });
  const nameById = Object.fromEntries(members.map((m) => [m.userId, m.user.name]));
  const isPlaceholderById = Object.fromEntries(members.map((m) => [m.userId, m.user.isPlaceholder]));

  const { netPositions, transactions } = await getHouseholdBalances(params.id);

  // Real (non-deleted) expenses with splits, so the settle-up UI can offer
  // "which expenses does this payment cover" as a way to derive a partial amount.
  const expenses = await prisma.expense.findMany({
    where: { householdId: params.id, deletedAt: null },
    include: { splits: true },
    orderBy: { date: "desc" },
  });

  return (
    <SettleUpView
      householdId={params.id}
      currentUserId={session.user.id}
      currency={household.currency}
      locale={session.user.locale}
      netPositions={netPositions.map((p) => ({
        ...p,
        name: nameById[p.userId] ?? "Unknown",
        isPlaceholder: isPlaceholderById[p.userId] ?? false,
      }))}
      transactions={transactions.map((tx) => ({
        ...tx,
        fromName: nameById[tx.fromUserId] ?? "Unknown",
        toName: nameById[tx.toUserId] ?? "Unknown",
      }))}
      expenses={expenses.map((e) => ({
        id: e.id,
        title: e.title,
        date: e.date.toISOString(),
        paidBy: e.paidBy,
        splits: e.splits.map((s) => ({ userId: s.userId, amountOwed: Number(s.amountOwed) })),
      }))}
    />
  );
}
