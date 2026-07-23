/**
 * Human-friendly date formatting shared by the stat cards, so months and
 * elapsed time read naturally ("Jan 2025", "3 days ago") instead of raw keys.
 */

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2025-01" → "Jan 2025". Falls back to the raw string if unparseable. */
export function formatMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return MONTH_FORMAT.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Whole-day elapsed count → "today", "yesterday", "3 days ago", "2 months ago". */
export function formatRelativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}
