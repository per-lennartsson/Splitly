import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ForbiddenError, requireAdmin } from "@/lib/household-access";
import { GuestClaimError, issueClaimToken } from "@/lib/guest-claim-service";

/** Admin-only: issues a fresh single-use link that lets someone take over this guest's spot. */
export async function POST(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; userId: string }> }
) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireAdmin(params.id, session.user.id);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    const token = await issueClaimToken(params.id, params.userId);
    return NextResponse.json({ path: `/claim/${token}` }, { status: 201 });
  } catch (e) {
    if (e instanceof GuestClaimError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
