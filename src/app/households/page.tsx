import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HouseholdSwitcher } from "@/components/household-switcher";

export default async function HouseholdsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const memberships = await prisma.householdMember.findMany({
    where: { userId: session.user.id, leftAt: null },
    include: {
      household: {
        include: { _count: { select: { members: { where: { leftAt: null } } } } },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const households = memberships.map((m) => ({
    id: m.household.id,
    name: m.household.name,
    householdType: m.household.householdType,
    currency: m.household.currency,
    inviteCode: m.household.inviteCode,
    role: m.role,
    memberCount: m.household._count.members,
  }));

  return (
    <HouseholdSwitcher
      households={households}
      userName={session.user.name ?? session.user.email ?? ""}
      locale={session.user.locale}
    />
  );
}
