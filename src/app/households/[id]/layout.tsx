import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HouseholdNav } from "@/components/household-nav";

export default async function HouseholdLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const membership = await prisma.householdMember.findFirst({
    where: { householdId: id, userId: session.user.id, leftAt: null },
    include: {
      household: {
        include: {
          members: {
            where: { leftAt: null },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { joinedAt: "asc" },
          },
          categories: { orderBy: { name: "asc" } },
        },
      },
    },
  });

  if (!membership) redirect("/households");

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <HouseholdNav
        householdId={id}
        householdName={membership.household.name}
        householdType={membership.household.householdType}
        currency={membership.household.currency}
        locale={session.user.locale}
        members={membership.household.members.map((m) => ({ userId: m.userId, name: m.user.name }))}
        categories={membership.household.categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
