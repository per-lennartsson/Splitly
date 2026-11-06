import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

// Link previews (iMessage, Slack, WhatsApp…) read these Open Graph tags; image URLs
// must be absolute, so metadataBase falls back to the production domain if
// NEXTAUTH_URL isn't set when a page is prerendered at build time.
const siteUrl = process.env.NEXTAUTH_URL?.startsWith("https://")
  ? process.env.NEXTAUTH_URL
  : "https://splitly.per-lennartsson.se";

const description = "Dela utgifter med hushållet, resesällskapet eller kompisgänget – och gör upp enkelt.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Splitly",
  description,
  openGraph: {
    type: "website",
    siteName: "Splitly",
    title: "Splitly",
    description,
    locale: "sv_SE",
  },
  twitter: { card: "summary_large_image", title: "Splitly", description },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
