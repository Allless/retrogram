/**
 * Duration formatting for reply-time style stats. `coarse` is for platforms
 * whose timestamps are minute-granular (WhatsApp exports), where anything at
 * or under a minute is indistinguishable — "≤1m" rather than false precision.
 */
export function humanizeSeconds(
  seconds: number | null,
  coarse = false,
): string {
  if (seconds === null) return "—";
  const s = Math.round(seconds);
  if (coarse && s <= 90) return "≤1m";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
