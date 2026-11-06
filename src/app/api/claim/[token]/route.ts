import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimGuest, getClaimPreview, GuestClaimError } from "@/lib/guest-claim-service";

function errorResponse(e: GuestClaimError) {
  const status = e.code === "INVALID" ? 404 : e.code === "EXPIRED" ? 410 : 400;
  return NextResponse.json({ error: e.message, code: e.code }, { status });
}

/** Public: what this claim link points to (group + guest name), without consuming it. */
export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  try {
    const preview = await getClaimPreview(params.token);
    return NextResponse.json({ guestName: preview.guestName, householdName: preview.householdName });
  } catch (e) {
    if (e instanceof GuestClaimError) return errorResponse(e);
    throw e;
  }
}

/** Logged-in: merges the guest into the caller's account and consumes the link. */
export async function POST(_req: Request, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await claimGuest(params.token, session.user.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof GuestClaimError) return errorResponse(e);
    throw e;
  }
}
