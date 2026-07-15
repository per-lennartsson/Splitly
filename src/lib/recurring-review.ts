/**
 * A recurring template is due for review once reviewIntervalMonths have
 * passed since it was last confirmed (created, edited, or explicitly
 * confirmed). Checked lazily wherever templates are listed — there is no
 * scheduled reminder.
 */
export function isReviewOverdue(lastConfirmedAt: Date, reviewIntervalMonths: number, now: Date = new Date()): boolean {
  const due = new Date(lastConfirmedAt);
  due.setMonth(due.getMonth() + reviewIntervalMonths);
  return due <= now;
}
