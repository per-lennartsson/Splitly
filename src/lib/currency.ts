export type CurrencyCode = "USD" | "SEK";

export const CURRENCY_OPTIONS: { value: CurrencyCode; label: string }[] = [
  { value: "USD", label: "US Dollar ($)" },
  { value: "SEK", label: "Swedish Krona (kr)" },
];

const CURRENCY_NATIVE_LOCALE: Record<CurrencyCode, string> = {
  USD: "en-US",
  SEK: "sv-SE",
};

/**
 * Formats an amount as currency. Number formatting conventions (decimal
 * separator, symbol placement) follow `locale` if given — e.g. a Swedish
 * user viewing a USD household still sees "1 234,56 $" — falling back to
 * the currency's own native locale when no UI locale is provided.
 */
export function formatMoney(amount: number, currency: CurrencyCode, locale?: string): string {
  return new Intl.NumberFormat(locale ?? CURRENCY_NATIVE_LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Just the currency's symbol (e.g. "$" or "kr"), for inline input prefixes. */
export function currencySymbol(currency: CurrencyCode, locale?: string): string {
  return new Intl.NumberFormat(locale ?? CURRENCY_NATIVE_LOCALE[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .formatToParts(0)
    .filter((p) => p.type === "currency")
    .map((p) => p.value)
    .join("");
}
