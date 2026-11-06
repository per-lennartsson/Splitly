import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClaimPreview, GuestClaimError, type ClaimPreview } from "@/lib/guest-claim-service";
import type { Locale } from "@/lib/i18n/translations";
import { GuestClaimCard } from "@/components/guest-claim-card";

export default async function ClaimGuestPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const session = await getServerSession(authOptions);

  let preview: ClaimPreview | null = null;
  let errorCode: "INVALID" | "EXPIRED" | null = null;
  try {
    preview = await getClaimPreview(params.token);
  } catch (e) {
    if (!(e instanceof GuestClaimError)) throw e;
    errorCode = e.code === "EXPIRED" ? "EXPIRED" : "INVALID";
  }

  return (
    <GuestClaimCard
      token={params.token}
      preview={preview ? { guestName: preview.guestName, householdName: preview.householdName } : null}
      errorCode={errorCode}
      sessionUser={
        session ? { email: session.user.email ?? "", locale: (session.user.locale as Locale) ?? "en" } : null
      }
    />
  );
}
