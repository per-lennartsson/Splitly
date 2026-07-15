import type { DefaultSession } from "next-auth";
import type { Locale } from "@/lib/i18n/translations";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      locale: Locale;
    } & DefaultSession["user"];
  }

  interface User {
    locale?: Locale;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    locale?: Locale;
  }
}
