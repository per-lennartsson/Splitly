import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHouseholdBalances, getOpenExpenseShares } from "@/lib/household-balances";
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

  // What's still open on each expense share — accounts for earlier custom-amount
  // payments (applied oldest first) as well as payments tagged with expenses, so
  // the "which expenses does this payment cover" picker never charges twice.
  const openShares = await getOpenExpenseShares(params.id);
  // Titles for the payment-history view, looked up regardless of deletedAt so a
  // settlement's history entry still shows what it was for even if the expense was later deleted.
  const expenseTitleById = Object.fromEntries(
    (await prisma.expense.findMany({ where: { householdId: params.id }, select: { id: true, title: true } })).map(
      (e) => [e.id, e.title]
    )
  );

  const settlements = await prisma.settlement.findMany({
    where: { householdId: params.id },
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
      openShares={openShares.map((sh) => ({
        expenseId: sh.expenseId,
        debtorId: sh.debtorId,
        creditorId: sh.creditorId,
        title: sh.title,
        owed: sh.owed,
        remaining: sh.remaining,
      }))}
      settlementHistory={settlements.map((s) => ({
        id: s.id,
        fromName: nameById[s.fromUserId] ?? "Unknown",
        toName: nameById[s.toUserId] ?? "Unknown",
        amount: Number(s.amount),
        date: s.date.toISOString().slice(0, 10),
        expenseTitles: s.expenseIds.map((id) => expenseTitleById[id]).filter((title): title is string => Boolean(title)),
      }))}
    />
  );
}
