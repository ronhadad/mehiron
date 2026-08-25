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

/**
 * Hotels worth considering for a vacation, without anyone typing a name.
 *
 * The completion flow already asks Google "which hotel do you mean?"; asking it
 * the destination instead turns the same request into a shortlist. Prices come
 * back for the real stay, so what is shown is what would be tracked.
 *
 * Already-watched hotels are dropped rather than shown greyed out: a
 * recommendation you have already acted on is not a recommendation.
 */
export interface RecommendInput extends Omit<SuggestInput, 'query'> {
  destination: string;
  /** Entity ids already being watched, excluded from the result. */
  exclude?: readonly string[];
  minRating?: number | null;
  minStars?: number | null;
  limit?: number;
  /** Nights in the stay, used to turn the listed nightly rate into a total. */
  nights?: number;
}

export interface Recommendation extends HotelSuggestion {
  /**
   * What the whole stay would cost.
   *
   * Verified against one hotel's own page: a destination search lists the
   * *nightly* rate, and ₪311 × 7 nights came to exactly the ₪2,176 total the
   * hotel page quoted. Showing the nightly figure as if it were the trip's cost
   * would understate a week by a factor of seven, so both are carried and both
   * are labelled.
   */
  stayTotal: number | null;
}

export async function recommendHotels(input: RecommendInput): Promise<Recommendation[]> {
  const hotels = await suggestHotels({ ...input, query: input.destination });
  const seen = new Set(input.exclude ?? []);
  const nights = input.nights ?? 1;

  /*
   * A missing rating means Google did not print one on the card, which it
   * mostly does not on a destination search. Treating unknown as zero would
   * make any minimum rating filter out every recommendation — so unknown
   * passes, and the filter only excludes hotels actually known to fall short.
   */
  const meets = (value: number | null, minimum: number | null | undefined): boolean =>
    minimum == null || value === null || value >= minimum;

  return hotels
    .filter((h) => !seen.has(h.entityId))
    // A destination search has no hotel it resolved *to*, so `primary` carries
    // no meaning here and is ignored.
    .filter((h) => meets(h.rating, input.minRating))
    .filter((h) => meets(h.stars, input.minStars))
    // Cheapest first, and anything Google declined to price goes last rather
    // than sorting as free.
    .sort((a, b) => (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER))
    .slice(0, input.limit ?? 8)
    .map((h) => ({ ...h, stayTotal: h.price === null ? null : Math.round(h.price * nights) }));
}
