/**
 * The shapes the screens work with, and the calls that fetch them.
 *
 * The types come from the domain layer rather than being restated here, so a
 * schema change surfaces as a type error in the UI instead of a wrong screen.
 */
import type { VacationWithOptions } from '@server/domain/vacations';
import type { Place } from '@server/google/places';
import type { HotelSuggestion } from '@server/google/hotels/suggest';
import type { Recommendation } from '@server/domain/hotelSearch';
import type { Assessment } from '@server/domain/verdict';
import type { PriceIndex } from '@server/google/flights/insight';

export type { Assessment, HotelSuggestion, PriceIndex, Place, Recommendation, VacationWithOptions };
export type OptionRow = VacationWithOptions['options'][number];

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });
  const body = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(body?.message ?? `שגיאת שרת (${response.status})`);
  return body as T;
}

export const listVacations = (): Promise<{ vacations: VacationWithOptions[] }> => send('/api/vacations');

export const getVacation = (id: string): Promise<{ vacation: VacationWithOptions }> =>
  send(`/api/vacations/${id}`);

export const createVacation = (input: unknown): Promise<{ vacation: VacationWithOptions }> =>
  send('/api/vacations', { method: 'POST', body: JSON.stringify(input) });

export const updateVacation = (id: string, edit: unknown): Promise<{ vacation: VacationWithOptions }> =>
  send(`/api/vacations/${id}`, { method: 'PATCH', body: JSON.stringify(edit) });

export const deleteVacation = (id: string): Promise<{ ok: true }> =>
  send(`/api/vacations/${id}`, { method: 'DELETE' });

export const checkVacation = (id: string): Promise<{ outcome: { checked: number; failed: number; drops: unknown[] } }> =>
  send(`/api/vacations/${id}/check`, { method: 'POST' });

export const addHotel = (id: string, hotel: unknown): Promise<{ option: OptionRow }> =>
  send(`/api/vacations/${id}/hotels`, { method: 'POST', body: JSON.stringify(hotel) });

export const suggestHotels = (id: string, q: string): Promise<{ hotels: HotelSuggestion[] }> =>
  send(`/api/vacations/${id}/hotels/suggest?q=${encodeURIComponent(q)}`);

export const recommendHotels = (id: string): Promise<{ hotels: Recommendation[]; message?: string }> =>
  send(`/api/vacations/${id}/hotels/recommend`);

export const watchFlights = (id: string): Promise<{ option: OptionRow }> =>
  send(`/api/vacations/${id}/flights`, { method: 'POST' });

export const setBooked = (id: string, bookedPrice: number | null): Promise<{ option: OptionRow }> =>
  send(`/api/options/${id}`, { method: 'PATCH', body: JSON.stringify({ bookedPrice }) });

export const removeOption = (id: string): Promise<{ ok: true }> =>
  send(`/api/options/${id}`, { method: 'DELETE' });

export const setFavorite = (id: string, favorite: boolean): Promise<{ option: OptionRow }> =>
  send(`/api/options/${id}`, { method: 'PATCH', body: JSON.stringify({ favorite }) });

export const searchPlaces = (q: string): Promise<{ places: Place[] }> =>
  send(`/api/places?q=${encodeURIComponent(q)}`);

/* ── formatting, shared by both screens ───────────────────────────── */

export const money = (amount: number | null, currency = 'ILS'): string =>
  amount === null
    ? '—'
    : `${currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `}${Math.round(amount).toLocaleString('en-US')}`;

const MONTHS = [
  'בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני',
  'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר',
];

/** An ISO date or timestamp → `2026-09-22`, for a date input. */
export function isoDate(value: string | Date): string {
  return (typeof value === 'string' ? value : value.toISOString()).slice(0, 10);
}

/** An ISO date or timestamp → `4 באוקטובר`. */
export function hebrewDate(value: string | Date): string {
  const iso = typeof value === 'string' ? value : value.toISOString();
  const [, m, d] = iso.slice(0, 10).split('-');
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(d)} ${month}` : iso.slice(0, 10);
}

export function nightsBetween(checkin: string | Date, checkout: string | Date): number {
  const a = new Date(checkin).getTime();
  const b = new Date(checkout).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

/** Today plus n days, as `YYYY-MM-DD` in local time. */
export function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * A keyless map of one point.
 *
 * OpenStreetMap's embed needs no API key, no billing and no script — an iframe
 * is the whole integration. Swapping in Google Maps later changes this function
 * and nothing else, because the coordinates are already stored on the vacation.
 */
export function mapUrl(lat: number, lon: number, spread = 0.25): string {
  const box = [lon - spread, lat - spread * 0.7, lon + spread, lat + spread * 0.7].map((n) => n.toFixed(4));
  return `https://www.openstreetmap.org/export/embed.html?bbox=${box.join(',')}&layer=mapnik&marker=${lat},${lon}`;
}

/** The direction a price moved since the check before it. */
export function movement(last: number | null, previous: number | null): 'down' | 'up' | 'flat' {
  if (last === null || previous === null) return 'flat';
  if (last < previous) return 'down';
  if (last > previous) return 'up';
  return 'flat';
}

/* ── price history, shaped for plotting ───────────────────────────── */

export interface Point {
  at: Date;
  price: number;
}

/**
 * A price series for one option, oldest first.
 *
 * Only successful checks contribute. A failed or empty check has no price, and
 * drawing it as zero would show a crash to nothing that never happened — the
 * gap is the honest representation.
 */
export function seriesOf(option: OptionRow, days: number): Point[] {
  const since = Date.now() - days * 86_400_000;
  return option.snapshots
    .filter((s) => s.price !== null && new Date(s.checkedAt).getTime() >= since)
    .map((s) => ({ at: new Date(s.checkedAt), price: s.price as number }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface PlotGeometry {
  line: string;
  area: string;
  last: { x: number; y: number };
  min: number;
  max: number;
  targetY: number | null;
}

/**
 * Turn a series into SVG paths.
 *
 * The vertical range is padded and never zero-height: a price that has not moved
 * would otherwise plot as a line along the very top of the box, which reads as a
 * maximum rather than as "flat".
 */
export function plot(points: Point[], width: number, height: number, target: number | null): PlotGeometry | null {
  if (points.length === 0) return null;

  const prices = points.map((p) => p.price);
  if (target !== null) prices.push(target);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const pad = (high - low) * 0.15 || Math.max(1, high * 0.02);
  const min = low - pad;
  const max = high + pad;

  const x = (i: number): number => (points.length === 1 ? width / 2 : (i / (points.length - 1)) * width);
  const y = (price: number): number => height - ((price - min) / (max - min)) * height;

  const coords = points.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`);
  const lastPoint = points[points.length - 1] as Point;

  return {
    line: coords.join(' '),
    area: `${coords.join(' ')} ${width.toFixed(1)},${height} 0,${height}`,
    last: { x: x(points.length - 1), y: y(lastPoint.price) },
    min: low,
    max: high,
    targetY: target === null ? null : y(target),
  };
}

/** `14:32` for today, `22.9 14:32` otherwise. */
export function shortTime(at: Date): string {
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  return sameDay ? time : `${at.getDate()}.${at.getMonth() + 1} ${time}`;
}

/**
 * Hebrew counts, which do not work the way English plurals do.
 *
 * One is a word, not a numeral: "מלון אחד", never "1 מלונות". Two has its own
 * form and drops the numeral entirely — "שני מלונות", not "2 מלונות". Three and
 * up take the numeral with the plural noun. Getting this wrong is the clearest
 * possible signal that nobody read the screen in Hebrew.
 */
export function count(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${many}`;
}

export const nightsLabel = (n: number): string => count(n, 'לילה אחד', 'שני לילות', 'לילות');
export const hotelsLabel = (n: number): string => count(n, 'מלון אחד', 'שני מלונות', 'מלונות');
export const companiesLabel = (n: number): string => count(n, 'חברה אחת', 'שתי חברות', 'חברות');
export const adultsLabel = (n: number): string => count(n, 'מבוגר אחד', 'שני מבוגרים', 'מבוגרים');

/**
 * How to say Google's price index on screen.
 *
 * Defined here rather than imported from the parser: the parser module pulls in
 * the HTML scrubbing helpers, and none of that belongs in a browser bundle for
 * the sake of three strings.
 */
export function priceIndexLabel(index: PriceIndex): string {
  if (index === 'low') return 'Google: המחירים נמוכים עכשיו';
  if (index === 'high') return 'Google: המחירים גבוהים עכשיו';
  return 'Google: המחירים רגילים עכשיו';
}

/* ── who was cheapest, over time ──────────────────────────────────── */

export interface CompanyRun {
  company: string;
  /** Checks in a row where this company was the cheapest. */
  checks: number;
  from: Date;
  to: Date;
  low: number;
  high: number;
}

/**
 * The booking companies that took turns being cheapest.
 *
 * The interesting fact about a hotel is rarely the price alone — it is that
 * Booking held the best rate for a week and then Agoda undercut it. That
 * switchover is already recorded, one `cheapestCompany` per snapshot; this reads
 * it back as runs rather than as a list, because "Booking for 9 checks, then
 * Agoda" is the sentence a person actually wants.
 *
 * Consecutive identical companies collapse into one run. A gap where a check
 * failed does not break a run: a company did not stop being cheapest because we
 * could not reach the page.
 */
export function companyRuns(option: OptionRow): CompanyRun[] {
  const runs: CompanyRun[] = [];

  // Oldest first, so a run reads forwards in time.
  const priced = [...option.snapshots]
    .reverse()
    .filter((s) => s.status === 'OK' && s.cheapestCompany !== null && s.price !== null);

  for (const snapshot of priced) {
    const company = snapshot.cheapestCompany as string;
    const price = snapshot.price as number;
    const at = new Date(snapshot.checkedAt);
    const current = runs[runs.length - 1];

    if (current && current.company === company) {
      current.checks += 1;
      current.to = at;
      current.low = Math.min(current.low, price);
      current.high = Math.max(current.high, price);
    } else {
      runs.push({ company, checks: 1, from: at, to: at, low: price, high: price });
    }
  }

  return runs;
}
