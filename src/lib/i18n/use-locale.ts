"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { Locale } from "@/lib/i18n/translations";

const STORAGE_KEY = "splitly-locale";

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("sv") ? "sv" : "en";
}

/**
 * Locale for logged-out pages (login/signup): persisted in localStorage,
 * defaulting to the browser's language. Once a user logs in, their saved
 * account preference (session.user.locale) takes over everywhere else.
 */
export function usePreAuthLocale(): [Locale, (locale: Locale) => void] {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    setLocale(stored ?? detectBrowserLocale());
  }, []);

  function update(next: Locale) {
    setLocale(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return [locale, update];
}

/** Locale for logged-in pages that are client components (no server-fetched session prop). */
export function useSessionLocale(): Locale {
  const { data } = useSession();
  return (data?.user?.locale as Locale) ?? "en";
}
