import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseItineraries, parseAirline, parseDuration, parseStops, parseRoute } from '../src/google/flights/parse.js';
import { parseCompanyQuotes, parseRating, parseStars } from '../src/google/hotels/parse.js';
import { fixture, FLIGHTS_TLV_RHO, HOTELS_KING_SOLOMON } from './fixtures.js';

describe('flights: real results page', () => {
  const itineraries = parseItineraries(fixture(FLIGHTS_TLV_RHO));

  it('finds the fares the page ships without JavaScript', () => {
    /*
     * Three, and that is the whole story: the static HTML carries only Google's
     * "best departing flights" section. The "other departing flights" heading is
     * present but its rows arrive by XHR, so a browser sees ~16 and a plain
     * fetch sees 3. The cheapest fare is always among the three, which is what a
     * vacation's headline number needs.
     */
    assert.equal(itineraries.length, 3);
  });

  it('reads the cheapest fare Google showed', () => {
    // The browser rendered $456 as the lowest on this capture.
    assert.equal(itineraries[0]?.price, 456);
    assert.equal(itineraries[0]?.currency, 'USD');
  });

  it('names the carrier, including ones no hardcoded list would have', () => {
    const airlines = itineraries.map((i) => i.airline);
    assert.ok(
      airlines.every((a) => /Bluebird Airways/i.test(a)),
      `expected Bluebird Airways throughout, got ${JSON.stringify(airlines)}`,
    );
  });

  it('reads the times, duration, stops and route of the cheapest', () => {
    const best = itineraries[0];
    assert.equal(best?.departTime, '19:50', 'a 7:50 PM departure must normalise to 24-hour');
    assert.equal(best?.arriveTime, '21:30');
    assert.equal(best?.durationMinutes, 100);
    assert.equal(best?.stops, 0);
    assert.equal(best?.route, 'TLV–RHO');
  });

  it('gives every itinerary a fare and a key', () => {
    for (const itinerary of itineraries) {
      assert.ok(itinerary.price > 0, 'a priced row must have a price');
      assert.ok(itinerary.key.length > 1, 'a row must be identifiable across checks');
    }
  });

  it('sorts cheapest first', () => {
    const prices = itineraries.map((i) => i.price);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  });
});

describe('hotels: real results page', () => {
  const quotes = parseCompanyQuotes(fixture(HOTELS_KING_SOLOMON));

  it('finds the booking companies — the point of using Google', () => {
    const names = quotes.map((q) => q.company);
    assert.ok(names.includes('Booking.com'), `expected Booking.com among ${JSON.stringify(names)}`);
    assert.ok(names.length >= 2, `expected more than one company, got ${JSON.stringify(names)}`);
  });

  it('reads prices that a naive regex cannot see', () => {
    // These sit behind RTL control characters; the first attempt at this
    // concluded, wrongly, that hotel prices were not in the HTML at all.
    const booking = quotes.find((q) => q.company === 'Booking.com');
    assert.equal(booking?.nightly, 898);
    assert.equal(booking?.total, 3_592);
    assert.equal(booking?.currency, 'ILS');
  });

  it('separates free cancellation from the other perks bundled in that line', () => {
    const booking = quotes.find((q) => q.company === 'Booking.com');
    assert.equal(booking?.freeCancellation, true);
    assert.match(booking?.conditions ?? '', /ביטול בחינם/);
  });

  it('sorts cheapest first, so the winner is quotes[0]', () => {
    const totals = quotes.map((q) => q.total);
    assert.deepEqual(totals, [...totals].sort((a, b) => a - b));
  });

  it('lists each company once, though Google repeats them across the page', () => {
    const names = quotes.map((q) => q.company);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('flight text helpers', () => {
  it('reads durations in both languages, including the bare Hebrew "hour"', () => {
    assert.equal(parseDuration('שעה 40 דקות'), 100);
    assert.equal(parseDuration('2 שעות 5 דקות'), 125);
    assert.equal(parseDuration('1 hr 40 min'), 100);
    assert.equal(parseDuration('45 דקות'), 45);
    assert.equal(parseDuration('no duration here'), null);
  });

  it('counts stops', () => {
    assert.equal(parseStops('טיסה ישירה'), 0);
    assert.equal(parseStops('Nonstop'), 0);
    assert.equal(parseStops('עצירה אחת'), 1);
    assert.equal(parseStops('2 עצירות'), 2);
    assert.equal(parseStops('unrelated'), null);
  });

  it('reads the route', () => {
    assert.equal(parseRoute('TLV–RHO'), 'TLV–RHO');
    assert.equal(parseRoute('no route'), null);
  });

  it('takes the airline from between the arrival time and the duration', () => {
    assert.equal(parseAirline('19:50 – 21:30 Bluebird Airways שעה 40 דקות TLV–RHO'), 'Bluebird Airways');
    assert.equal(parseAirline('15:40 – 17:20 ישראייר שעה 40 דקות TLV–RHO'), 'ישראייר');
  });
});

describe('hotel text helpers', () => {
  it('reads a rating out of five and its review count', () => {
    assert.deepEqual(parseRating('4.4/5 (1.9K)'), { rating: 4.4, count: 1_900 });
    assert.deepEqual(parseRating('4.8/5 (8.1K)'), { rating: 4.8, count: 8_100 });
    assert.deepEqual(parseRating('4.1/5 (576)'), { rating: 4.1, count: 576 });
    assert.deepEqual(parseRating('nothing here'), { rating: null, count: null });
  });

  it('reads the star class in either language', () => {
    assert.equal(parseStars('מלון 4 כוכבים'), 4);
    assert.equal(parseStars('5-star hotel'), 5);
    assert.equal(parseStars('guesthouse'), null);
  });
});
