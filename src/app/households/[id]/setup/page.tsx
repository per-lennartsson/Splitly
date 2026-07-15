import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HouseholdSetup } from "@/components/household-setup";

export default async function HouseholdSetupPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const household = await prisma.household.findFirst({
    where: { id: params.id, members: { some: { userId: session.user.id, leftAt: null } } },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!household) redirect("/households");

  const members = household.members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    defaultSplitPercent: m.defaultSplitPercent ? Number(m.defaultSplitPercent) : 0,
  }));

  return (
    <HouseholdSetup
      household={{
        id: household.id,
        name: household.name,
        householdType: household.householdType,
        inviteCode: household.inviteCode,
      }}
      members={members}
      currentUserId={session.user.id}
      locale={session.user.locale}
    />
  );
}
