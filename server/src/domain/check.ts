/**
 * Running one check of one vacation, and writing down what was found.
 *
 * The flights half is a single request that prices every itinerary at once, so
 * "the cheapest fare" and every pinned flight are all resolved from the same
 * page — one load, many options updated. Each hotel is its own request, because
 * Google prices a hotel on its own page.
 *
 * A check that fails is recorded as a snapshot too. A gap in the history is
 * indistinguishable from "we never looked", and that distinction is the whole
 * point of keeping history.
 */
import { db } from './db.js';
import { searchTerms, type VacationWithOptions } from './vacations.js';
import { fetchGooglePage } from '../google/fetch.js';
import { parseItineraries, type Itinerary } from '../google/flights/parse.js';
import { flightSearchUrl, passengersFor, roundTrip } from '../google/flights/url.js';
import { parseCompanyQuotes, type CompanyQuote } from '../google/hotels/parse.js';
import { hotelEntityUrl, hotelSearchUrl } from '../google/hotels/url.js';
import type { CheckStatus, Option } from '@prisma/client';

export interface CheckOutcome {
  vacationId: string;
  checked: number;
  failed: number;
  drops: Array<{ optionId: string; title: string; from: number; to: number }>;
}

/** The identity a flight is re-found by on the next check. */
export function keyOf(itinerary: Itinerary): string {
  return itinerary.key;
}

/**
 * Apply the vacation's filters to what Google returned.
 *
 * Google's own filter parameters live in the same protobuf as the dates and are
 * not yet decoded, so filtering happens here instead. The difference matters:
 * this narrows what is *tracked*, not what Google searched, so a filter that
 * excludes everything shows an empty result rather than a wrong one.
 */
function keepFlight(itinerary: Itinerary, maxStops: number | null): boolean {
  if (maxStops === null) return true;
  return itinerary.stops === null || itinerary.stops <= maxStops;
}

function keepQuote(quote: CompanyQuote, freeOnly: boolean, maxNightly: number | null): boolean {
  if (freeOnly && !quote.freeCancellation) return false;
  if (maxNightly !== null && quote.nightly !== null && quote.nightly > maxNightly) return false;
  return true;
}

/** Write one snapshot and move the option's rolled-up numbers along. */
async function record(
  option: Option,
  status: CheckStatus,
  price: number | null,
  currency: string | null,
  quotes: CompanyQuote[],
  note: string | null,
  facets: Partial<Option> = {},
): Promise<{ dropped: { from: number; to: number } | null }> {
  const snapshot = await db.snapshot.create({
    data: {
      optionId: option.id,
      status,
      price,
      currency,
      cheapestCompany: quotes[0]?.company ?? null,
      note,
      quotes: {
        create: quotes.map((q) => ({
          company: q.company,
          price: Math.round(q.total),
          nightly: q.nightly === null ? null : Math.round(q.nightly),
          currency: q.currency,
          conditions: q.conditions,
          freeCancellation: q.freeCancellation,
        })),
      },
    },
  });

  const previous = option.lastPrice;
  const lowest =
    price !== null && (option.lowestPrice === null || price < option.lowestPrice) ? price : option.lowestPrice;

  await db.option.update({
    where: { id: option.id },
    data: {
      ...facets,
      lastCheckedAt: snapshot.checkedAt,
      lastStatus: status,
      // A failed check must not overwrite the last real price with null; the
      // screen would then show "—" for something that has a perfectly good
      // known price and merely could not be reached this time.
      ...(price === null ? {} : { lastPrice: price, previousPrice: previous }),
      ...(price !== null && lowest === price ? { lowestPrice: price, lowestAt: snapshot.checkedAt } : {}),
    },
  });

  const dropped = price !== null && previous !== null && price < previous ? { from: previous, to: price } : null;
  return { dropped };
}

export async function checkVacation(vacation: VacationWithOptions): Promise<CheckOutcome> {
  const terms = searchTerms(vacation);
  const outcome: CheckOutcome = { vacationId: vacation.id, checked: 0, failed: 0, drops: [] };

  const flightOptions = vacation.options.filter((o) => o.kind === 'FLIGHT' && o.active);
  const hotelOptions = vacation.options.filter((o) => o.kind === 'HOTEL' && o.active);

  /* ── flights: one page, every flight option updated from it ───────── */
  if (flightOptions.length > 0) {
    const url = flightSearchUrl(
      roundTrip({
        from: vacation.originAirport,
        to: vacation.destinationMid,
        depart: terms.checkin,
        return: terms.checkout,
        passengers: passengersFor(terms.adults, terms.childAges),
        currency: terms.currency,
        ...(vacation.maxStops === null ? {} : { maxStops: vacation.maxStops }),
      }),
    );

    let itineraries: Itinerary[] | null = null;
    let failure: string | null = null;
    try {
      const { html } = await fetchGooglePage(url);
      const parsed = parseItineraries(html).filter((i) => keepFlight(i, vacation.maxStops));
      const empty = /לא נמצאו טיסות|no flights found|אין טיסות/i.test(html);
      if (parsed.length === 0 && !empty) {
        failure = 'לא זוהו טיסות בדף של Google — ייתכן שהפורמט השתנה או שהבקשה נדחתה';
      } else {
        itineraries = parsed;
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : 'החיפוש נכשל';
    }

    for (const option of flightOptions) {
      outcome.checked += 1;
      if (itineraries === null) {
        outcome.failed += 1;
        await record(option, 'FAILED', null, null, [], failure);
        continue;
      }

      // A null matchKey means "whatever is cheapest"; anything else is pinned
      // and must be re-found by its own identity.
      const found = option.matchKey === null ? itineraries[0] : itineraries.find((i) => keyOf(i) === option.matchKey);

      if (!found) {
        await record(option, 'EMPTY', null, null, [], 'הטיסה לא הופיעה בבדיקה הזאת');
        continue;
      }

      const { dropped } = await record(option, 'OK', Math.round(found.price), found.currency, [], null, {
        title: option.matchKey === null ? option.title : `${found.airline} · ${found.departTime ?? ''}`.trim(),
        airline: found.airline,
        departTime: found.departTime,
        arriveTime: found.arriveTime,
        durationMinutes: found.durationMinutes,
        stops: found.stops,
        route: found.route,
      });
      if (dropped) outcome.drops.push({ optionId: option.id, title: option.title, ...dropped });
    }
  }

  /* ── hotels: one request each ─────────────────────────────────────── */
  for (const option of hotelOptions) {
    outcome.checked += 1;
    try {
      // Google's own id beats the name every time: it cannot match the wrong
      // hotel, and it returns more booking companies for the same stay.
      const stay = {
        checkin: terms.checkin,
        checkout: terms.checkout,
        adults: terms.adults,
        childAges: terms.childAges,
        currency: terms.currency,
      };
      const url = option.entityId
        ? hotelEntityUrl(option.entityId, stay)
        : hotelSearchUrl({ ...stay, query: option.hotelQuery ?? option.title });
      const { html } = await fetchGooglePage(url);
      const quotes = parseCompanyQuotes(html).filter((q) =>
        keepQuote(q, vacation.freeCancellationOnly, vacation.maxNightly),
      );

      if (quotes.length === 0) {
        await record(option, 'EMPTY', null, null, [], 'לא נמצאו מחירים למלון הזה בבדיקה הזאת');
        continue;
      }

      const cheapest = quotes[0] as CompanyQuote;
      const { dropped } = await record(option, 'OK', Math.round(cheapest.total), cheapest.currency, quotes, null);
      if (dropped) outcome.drops.push({ optionId: option.id, title: option.title, ...dropped });
    } catch (error) {
      outcome.failed += 1;
      await record(option, 'FAILED', null, null, [], error instanceof Error ? error.message : 'הבדיקה נכשלה');
    }
  }

  await db.vacation.update({ where: { id: vacation.id }, data: { lastCheckedAt: new Date() } });
  return outcome;
}
