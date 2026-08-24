/**
 * The shapes the screens work with, and the calls that fetch them.
 *
 * The types come from the domain layer rather than being restated here, so a
 * schema change surfaces as a type error in the UI instead of a wrong screen.
 */
import type { VacationWithOptions } from '@server/domain/vacations';
import type { Place } from '@server/google/places';
import type { HotelSuggestion } from '@server/google/hotels/suggest';

export type { HotelSuggestion, Place, VacationWithOptions };
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

export const checkVacation = (id: string): Promise<{ outcome: { checked: number; failed: number; drops: unknown[] } }> =>
  send(`/api/vacations/${id}/check`, { method: 'POST' });

export const addHotel = (id: string, hotel: unknown): Promise<{ option: OptionRow }> =>
  send(`/api/vacations/${id}/hotels`, { method: 'POST', body: JSON.stringify(hotel) });

export const suggestHotels = (id: string, q: string): Promise<{ hotels: HotelSuggestion[] }> =>
  send(`/api/vacations/${id}/hotels/suggest?q=${encodeURIComponent(q)}`);

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
