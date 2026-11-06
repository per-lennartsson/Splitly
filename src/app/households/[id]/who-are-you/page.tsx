import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSelfClaimableGuests } from "@/lib/guest-claim-service";
import { GuestPicker } from "@/components/guest-picker";

/** Shown right after joining an event group with the code, when it already has guests. */
export default async function WhoAreYouPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const guests = await listSelfClaimableGuests(params.id, session.user.id);
  if (guests.length === 0) redirect(`/households/${params.id}/dashboard`);

  const household = await prisma.household.findUnique({ where: { id: params.id }, select: { name: true } });

  return (
    <GuestPicker
      householdId={params.id}
      householdName={household?.name ?? ""}
      guests={guests}
      locale={session.user.locale}
    />
  );
}
