import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClaimPreview, GuestClaimError, type ClaimPreview } from "@/lib/guest-claim-service";
import type { Locale } from "@/lib/i18n/translations";
import { GuestClaimCard } from "@/components/guest-claim-card";

/** Link preview for the claim link, e.g. in iMessage: "Embla, gå med i Grancan på Splitly". */
export async function generateMetadata({
  params: paramsPromise,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const params = await paramsPromise;
  try {
    const preview = await getClaimPreview(params.token);
    const title = `${preview.guestName}, gå med i ${preview.householdName} på Splitly`;
    const description = `Du har lagts till som ${preview.guestName}. Skapa ett konto för att se och lägga till utgifter.`;
    return {
      title,
      description,
      openGraph: { title, description },
      twitter: { title, description },
      robots: { index: false },
    };
  } catch (e) {
    if (e instanceof GuestClaimError) return { robots: { index: false } };
    throw e;
  }
}

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
