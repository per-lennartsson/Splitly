import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ForbiddenError, requireMembership } from "@/lib/household-access";
import { claimGuestSelf, GuestClaimError } from "@/lib/guest-claim-service";

/** A member who just joined with the group code says "I'm this guest" and takes over the guest's spot. */
export async function POST(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireMembership(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    const result = await claimGuestSelf(params.id, params.userId, session.user.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof GuestClaimError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    throw e;
  }
}
