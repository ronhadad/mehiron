/**
 * Building a Google Hotels search URL.
 *
 * The dates, the party and the currency all live inside the `ts` protobuf.
 * `?checkin=…&checkout=…` looks like it works — Google accepts the parameters,
 * returns HTTP 200, and renders whatever dates the session already had. A search
 * built that way reports real prices for the wrong stay, which is the worst kind
 * of wrong. `url.test.ts` re-encodes a search captured from Google's own date
 * picker and asserts the bytes match.
 */
import { encodeParam, type PbMessage } from '../protobuf.js';

export interface HotelSearch {
  /** Free text exactly as it would be typed into Google, or a hotel name. */
  query: string;
  /** `YYYY-MM-DD`. */
  checkin: string;
  checkout: string;
  adults: number;
  /** One entry per child, their age in years. */
  childAges?: readonly number[];
  currency?: string;
  language?: string;
  country?: string;
}

/** Google encodes a date as three separate numbers, not a string. */
function dateMessage(iso: string): PbMessage {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`hotel search dates must be YYYY-MM-DD, got "${iso}"`);
  return { 1: Number(match[1]), 2: Number(match[2]), 3: Number(match[3]) };
}

/**
 * The occupancy block.
 *
 * Field 1 is the adult count. Children are sent as one repeated entry per child
 * carrying their age — Google prices a two-year-old and a ten-year-old
 * differently, so the ages are not optional detail.
 *
 * Only the adults field appears in the captured reference URL (that search had
 * no children), so `buildTs` is asserted byte-exact for adults alone; the child
 * encoding is verified live instead, by reading the occupancy control back off
 * the rendered page. See `verifyOccupancy` in the probe.
 */
function occupancyMessage(adults: number, childAges: readonly number[]): PbMessage {
  const message: PbMessage = { 1: Math.max(1, Math.trunc(adults)) };
  if (childAges.length > 0) message[2] = childAges.map((age) => Math.max(0, Math.trunc(age)));
  return message;
}

export function buildTs(search: HotelSearch): string {
  const message: PbMessage = {
    1: 0,
    3: {
      2: {
        2: { 1: dateMessage(search.checkin), 2: dateMessage(search.checkout) },
        6: occupancyMessage(search.adults, search.childAges ?? []),
      },
    },
    5: { 1: { 7: search.currency ?? 'ILS' } },
  };
  return encodeParam(message);
}

export function hotelSearchUrl(search: HotelSearch): string {
  const url = new URL('https://www.google.com/travel/search');
  url.searchParams.set('q', search.query);
  url.searchParams.set('ts', buildTs(search));
  url.searchParams.set('hl', search.language ?? 'he');
  url.searchParams.set('gl', search.country ?? 'il');
  url.searchParams.set('curr', search.currency ?? 'ILS');
  return url.toString();
}

/** Nights in the stay — the divisor between a nightly rate and a stay total. */
export function nightsBetween(checkin: string, checkout: string): number {
  const [inMs, outMs] = [checkin, checkout].map((iso) => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    // Local midnight: a UTC-based date can slide a day across a timezone.
    return new Date(y, m - 1, d).getTime();
  });
  return Math.max(1, Math.round(((outMs as number) - (inMs as number)) / 86_400_000));
}
