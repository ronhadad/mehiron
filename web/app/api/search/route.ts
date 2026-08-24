/**
 * One vacation, priced.
 *
 * Runs both Google searches and returns them together — the same work the probe
 * CLI does, behind HTTP. No database yet: this endpoint is stateless, so the
 * wizard can be used end to end before storage exists.
 */
import { NextResponse } from 'next/server';
import { fetchGooglePage, GoogleFetchError } from '@server/google/fetch.js';
import { parseItineraries, type Itinerary } from '@server/google/flights/parse.js';
import { flightSearchUrl, passengersFor, roundTrip } from '@server/google/flights/url.js';
import { parseCompanyQuotes, type CompanyQuote } from '@server/google/hotels/parse.js';
import { hotelSearchUrl, nightsBetween } from '@server/google/hotels/url.js';
import { destinationPhoto, type DestinationPhoto } from '@server/google/images.js';

// The Google layer uses node APIs and must not be bundled for the edge.
export const runtime = 'nodejs';
// Each request drives two live searches; nothing here is cacheable.
export const dynamic = 'force-dynamic';
// Two live Google searches, run together.
export const maxDuration = 30;

export interface SearchRequest {
  /** Airport code or Google entity mid — what the flights search needs. */
  destination: string;
  /** The place as a person names it. Used for the photograph, never for search. */
  label?: string;
  origin?: string;
  hotelQuery?: string;
  checkin: string;
  checkout: string;
  adults: number;
  childAges?: number[];
  currency?: string;
}

export interface SearchResponse {
  nights: number;
  photo: DestinationPhoto | null;
  /** What was actually asked of Google — the entity and the URL, so a surprising
   *  result can be traced to the search that produced it rather than guessed at. */
  searched: { destination: string; flightsUrl: string; hotelQuery: string };
  flights: { itineraries: Itinerary[]; error: string | null };
  hotels: { quotes: CompanyQuote[]; error: string | null };
}

/** A failed half must not take the other half down with it. */
async function attempt<T>(work: () => Promise<T>, fallback: T): Promise<{ value: T; error: string | null }> {
  try {
    return { value: await work(), error: null };
  } catch (error) {
    const message =
      error instanceof GoogleFetchError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'החיפוש נכשל';
    return { value: fallback, error: message };
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let input: SearchRequest;
  try {
    input = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ message: 'בקשה לא תקינה' }, { status: 400 });
  }

  if (!input.destination || !input.checkin || !input.checkout) {
    return NextResponse.json({ message: 'צריך יעד ותאריכים' }, { status: 400 });
  }

  const currency = input.currency ?? 'ILS';
  const childAges = input.childAges ?? [];
  const adults = Math.max(1, input.adults || 2);
  const hotelQuery = input.hotelQuery?.trim() || input.destination;

  const flightsUrl = flightSearchUrl(
    roundTrip({
      from: input.origin ?? 'TLV',
      to: input.destination,
      depart: input.checkin,
      return: input.checkout,
      passengers: passengersFor(adults, childAges),
      currency,
    }),
  );

  const [flights, hotels, photo] = await Promise.all([
    attempt<Itinerary[]>(async () => {
      const { html } = await fetchGooglePage(flightsUrl);
      const itineraries = parseItineraries(html);
      /*
       * An empty list has two very different causes, and conflating them means
       * the screen says "no flights on these dates" when the truth is that the
       * page changed shape or the request was turned away. Google states the
       * former in words, so its absence is treated as the latter.
       */
      if (itineraries.length === 0 && !/לא נמצאו טיסות|no flights found|אין טיסות/i.test(html)) {
        throw new Error('לא זוהו טיסות בדף של Google — ייתכן שהפורמט השתנה או שהבקשה נדחתה');
      }
      return itineraries;
    }, []),

    attempt<CompanyQuote[]>(async () => {
      const url = hotelSearchUrl({
        query: hotelQuery,
        checkin: input.checkin,
        checkout: input.checkout,
        adults,
        childAges,
        currency,
      });
      return parseCompanyQuotes((await fetchGooglePage(url)).html);
    }, []),

    // The photo is decoration: a failure here must never fail the search.
    destinationPhoto(input.label ?? input.destination).catch(() => null),
  ]);

  const body: SearchResponse = {
    nights: nightsBetween(input.checkin, input.checkout),
    photo,
    searched: { destination: input.destination, flightsUrl, hotelQuery },
    flights: { itineraries: flights.value, error: flights.error },
    hotels: { quotes: hotels.value, error: hotels.error },
  };

  return NextResponse.json(body);
}
