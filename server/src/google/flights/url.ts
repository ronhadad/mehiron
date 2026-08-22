/**
 * Building a Google Flights search URL.
 *
 * The whole query lives in the `tfs` parameter as a base64url protobuf. Field
 * numbers and their meanings below were read off a real search captured from the
 * user's browser and decoded — see `url.test.ts`, which re-encodes that exact
 * search and asserts the bytes come back identical. That round-trip is the only
 * thing standing between us and a search that quietly means something else.
 */
import { encodeParam, type PbMessage } from '../protobuf.js';

/** How a place is named. Google accepts either form in the same field. */
export const PLACE_AIRPORT = 1;
/** A Knowledge Graph mid such as `/m/07yfd0` (Rhodes) — a city or region. */
export const PLACE_ENTITY = 2;

export interface Place {
  /** `TLV`, or `/m/07yfd0`. */
  code: string;
}

/** An airport code is three uppercase letters; anything else is an entity mid. */
function placeMessage(place: Place): PbMessage {
  const isAirport = /^[A-Z]{3}$/.test(place.code);
  return { 1: isAirport ? PLACE_AIRPORT : PLACE_ENTITY, 2: place.code };
}

export const CABIN = { economy: 1, premiumEconomy: 2, business: 3, first: 4 } as const;
export type Cabin = keyof typeof CABIN;

/**
 * Passenger types, repeated once per traveller — three adults are three `1`s.
 * An infant under two normally travels `infantOnLap`; `infantInSeat` buys them
 * their own seat.
 */
export const PASSENGER = { adult: 1, child: 2, infantInSeat: 3, infantOnLap: 4 } as const;
export type PassengerType = keyof typeof PASSENGER;

/**
 * Field 2 is *not* the trip type, despite looking like one.
 *
 * Tested directly against Google with a single-slice search: `1` returns the
 * generic "search flights" landing page with no fares, `3` returns
 * "תל אביב-יפו לכל מקום" (the explore-everywhere view), and only `2` returns an
 * actual results page. Whether the trip is one-way or a return is decided by how
 * many slices are in field 3, not by this value.
 *
 * So it is a constant, named for what it does rather than what it was assumed
 * to be. Left as a knob because it is the field to reach for if Google ever
 * changes which view a search lands on.
 */
export const SEARCH_MODE_RESULTS = 2;

export interface Slice {
  /** `YYYY-MM-DD`. */
  date: string;
  from: Place;
  to: Place;
  /** 0 means "any number of stops"; 1 means non-stop only. */
  maxStops?: number;
}

export interface FlightSearch {
  slices: Slice[];
  passengers: PassengerType[];
  cabin?: Cabin;
  /** ISO code Google should price in, e.g. `ILS`. */
  currency?: string;
  /** UI language; affects airline names in the HTML, not the numbers. */
  language?: string;
  /** Market. Israeli fares differ from US ones for the same route. */
  country?: string;
}

/** The constant tail every captured search carries. Meaning unknown; copied faithfully. */
const NO_MAX_PRICE: PbMessage = { 1: -1 };

export function buildTfs(search: FlightSearch): string {
  if (search.slices.length === 0) throw new Error('a flight search needs at least one slice');
  if (search.passengers.length === 0) throw new Error('a flight search needs at least one passenger');

  const message: PbMessage = {
    1: 28,
    2: SEARCH_MODE_RESULTS,
    3: search.slices.map((slice) => ({
      2: slice.date,
      5: slice.maxStops ?? 0,
      13: placeMessage(slice.from),
      14: placeMessage(slice.to),
    })),
    8: search.passengers.map((p) => PASSENGER[p]),
    9: CABIN[search.cabin ?? 'economy'],
    14: 1,
    16: NO_MAX_PRICE,
    19: 1,
  };

  return encodeParam(message);
}

export function flightSearchUrl(search: FlightSearch): string {
  const url = new URL('https://www.google.com/travel/flights/search');
  url.searchParams.set('tfs', buildTfs(search));
  // Observed on every real search; keeps Google on the results view rather than
  // bouncing to the explore/date-grid experience.
  url.searchParams.set('tfu', 'EgIIACIA');
  url.searchParams.set('hl', search.language ?? 'he');
  url.searchParams.set('gl', search.country ?? 'il');
  url.searchParams.set('curr', search.currency ?? 'ILS');
  return url.toString();
}

/** A round trip out and back between the same two places. */
export function roundTrip(opts: {
  from: string;
  to: string;
  depart: string;
  return: string;
  passengers: PassengerType[];
  cabin?: Cabin;
  maxStops?: number;
  currency?: string;
  language?: string;
  country?: string;
}): FlightSearch {
  const from: Place = { code: opts.from };
  const to: Place = { code: opts.to };
  return {
    slices: [
      { date: opts.depart, from, to, ...(opts.maxStops === undefined ? {} : { maxStops: opts.maxStops }) },
      { date: opts.return, from: to, to: from, ...(opts.maxStops === undefined ? {} : { maxStops: opts.maxStops }) },
    ],
    passengers: opts.passengers,
    ...(opts.cabin === undefined ? {} : { cabin: opts.cabin }),
    ...(opts.currency === undefined ? {} : { currency: opts.currency }),
    ...(opts.language === undefined ? {} : { language: opts.language }),
    ...(opts.country === undefined ? {} : { country: opts.country }),
  };
}

/** Travellers as a vacation stores them, expanded into Google's repeated field. */
export function passengersFor(adults: number, childAges: readonly number[] = []): PassengerType[] {
  const out: PassengerType[] = Array.from({ length: Math.max(1, adults) }, () => 'adult' as const);
  for (const age of childAges) {
    // Under two flies on a lap unless a seat is bought; Google prices the two
    // very differently, so the age has to decide it rather than a default.
    out.push(age < 2 ? 'infantOnLap' : 'child');
  }
  return out;
}
