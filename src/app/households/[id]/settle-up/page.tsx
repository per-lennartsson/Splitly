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

  const members = await prisma.householdMember.findMany({
    where: { householdId: params.id, leftAt: null },
    include: { user: { select: { id: true, name: true } } },
  });
  const nameById = Object.fromEntries(members.map((m) => [m.userId, m.user.name]));

  const { netPositions, transactions } = await getHouseholdBalances(params.id);

  return (
    <SettleUpView
      householdId={params.id}
      currentUserId={session.user.id}
      currency={household.currency}
      locale={session.user.locale}
      netPositions={netPositions.map((p) => ({ ...p, name: nameById[p.userId] ?? "Unknown" }))}
      transactions={transactions.map((tx) => ({
        ...tx,
        fromName: nameById[tx.fromUserId] ?? "Unknown",
        toName: nameById[tx.toUserId] ?? "Unknown",
      }))}
    />
  );
}
