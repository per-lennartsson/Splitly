import { translations, type Dictionary, type Locale } from "@/lib/i18n/translations";

type PathsToStringProps<T> = T extends string
  ? []
  : {
      [K in Extract<keyof T, string>]: [K, ...PathsToStringProps<T[K]>];
    }[Extract<keyof T, string>];

type Join<T extends string[]> = T extends [infer F extends string, ...infer R extends string[]]
  ? R extends []
    ? F
    : `${F}.${Join<R>}`
  : never;

export type TranslationKey = Join<PathsToStringProps<Dictionary>>;

/** Looks up a dot-path translation key for the given locale, with optional {param} interpolation. */
export function t(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const dict = translations[locale] ?? translations.en;
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);

  let result = typeof value === "string" ? value : key;

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
    }
  }

  return result;
}

/** English/Swedish member-count pluralization: "{count} member(s)" / "{count} medlem(mar)". */
export function tPlural(
  locale: Locale,
  count: number,
  oneKey: TranslationKey,
  otherKey: TranslationKey
): string {
  return t(locale, count === 1 ? oneKey : otherKey, { count });
}

export type { Locale };
