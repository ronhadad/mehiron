/**
 * Asking Google which hotels it means, so a saved hotel is one Google can price.
 *
 * This exists because a typed name is usually close but not exact — "dandrea
 * mare rhodes" finds the hotel, but Google prices it as "D'Andrea Mare Beach
 * Hotel", and searching the inexact wording often returns a page with no
 * partner prices at all.
 */
import { fetchGooglePage } from '../google/fetch.js';
import { hotelSuggestUrl } from '../google/hotels/url.js';
import { parseHotelSuggestions, type HotelSuggestion } from '../google/hotels/suggest.js';

export type { HotelSuggestion };

export interface SuggestInput {
  query: string;
  checkin: string;
  checkout: string;
  adults: number;
  childAges?: number[];
  currency?: string;
}

/**
 * Suggestions are priced for the real stay rather than for a generic date.
 *
 * It costs nothing extra — Google needs dates either way — and it means the
 * price shown beside each suggestion is the price that will be tracked.
 */
export async function suggestHotels(input: SuggestInput): Promise<HotelSuggestion[]> {
  const query = input.query.trim();
  if (query.length < 3) return [];

  const url = hotelSuggestUrl({
    query,
    checkin: input.checkin,
    checkout: input.checkout,
    adults: Math.max(1, input.adults),
    childAges: input.childAges ?? [],
    currency: input.currency ?? 'ILS',
  });

  const { html } = await fetchGooglePage(url);
  return parseHotelSuggestions(html);
}
