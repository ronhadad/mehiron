/**
 * Dates cross three representations in this app — the `YYYY-MM-DD` a form
 * sends, the `@db.Date` Postgres column, and the year/month/day triple Google's
 * `ts` protobuf wants — and every conversion is a chance to slip a day.
 *
 * Everything here works in UTC noon. A date-only value parsed at UTC midnight
 * and then read back in a timezone behind UTC lands on the previous day, which
 * is exactly how a stay silently shifts.
 */

/** `2026-09-03` → a Date safe to store in a date column. */
export function fromIso(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) throw new Error(`expected YYYY-MM-DD, got "${iso}"`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

/** A stored date back to `YYYY-MM-DD`. */
export function toIso(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Nights between two stored dates. */
export function nights(checkin: Date, checkout: Date): number {
  return Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / 86_400_000));
}
