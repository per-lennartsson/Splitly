export function formatMonthLabel(year: number, monthIndex0: number, intlLocale = "en-US"): string {
  return new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" }).format(
    new Date(year, monthIndex0, 1)
  );
}

export function addMonths(year: number, monthIndex0: number, delta: number): { year: number; monthIndex0: number } {
  const total = year * 12 + monthIndex0 + delta;
  return { year: Math.floor(total / 12), monthIndex0: ((total % 12) + 12) % 12 };
}

export function isSameOrFutureMonth(year: number, monthIndex0: number, refYear: number, refMonthIndex0: number): boolean {
  return year > refYear || (year === refYear && monthIndex0 >= refMonthIndex0);
}
