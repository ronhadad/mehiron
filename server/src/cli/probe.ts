/**
 * One vacation, priced end to end, printed to a terminal.
 *
 * No database, no queue, no browser — just the two Google searches a vacation
 * needs. It exists to make the pipeline observable before any of it is wired to
 * storage, and to be the thing you run when a parser stops finding prices.
 *
 *   npm run probe -- --to /m/07yfd0 --hotels "רודוס" --from 2026-09-03 --to-date 2026-09-11
 *   npm run probe -- --hotels "ישרוטל המלך שלמה אילת" --from 2027-02-17 --to-date 2027-02-21
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fetchGooglePage, GoogleFetchError } from '../google/fetch.js';
import { cheapestItinerary, parseItineraries } from '../google/flights/parse.js';
import { flightSearchUrl, passengersFor, roundTrip } from '../google/flights/url.js';
import { parseCompanyQuotes } from '../google/hotels/parse.js';
import { hotelSearchUrl, nightsBetween } from '../google/hotels/url.js';
import { plainText } from '../google/rtl.js';

interface Args {
  origin: string;
  destination: string | null;
  hotelQuery: string | null;
  checkin: string;
  checkout: string;
  adults: number;
  childAges: number[];
  currency: string;
  language: string;
  save: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const ages = get('children');

  return {
    origin: get('origin') ?? 'TLV',
    destination: get('to'),
    hotelQuery: get('hotels'),
    checkin: get('from') ?? '2026-09-03',
    checkout: get('to-date') ?? '2026-09-11',
    adults: Number(get('adults') ?? 2),
    childAges: ages ? ages.split(',').map(Number).filter(Number.isFinite) : [],
    currency: get('currency') ?? 'ILS',
    language: get('lang') ?? 'he',
    save: get('save'),
  };
}

const money = (amount: number, currency: string): string =>
  `${currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `}${amount.toLocaleString('en-US')}`;

function rule(title: string): void {
  console.log(`\n[1m${title}[0m\n${'─'.repeat(Math.max(24, title.length))}`);
}

/**
 * Read the occupancy control back off the page.
 *
 * The check-in parameters are accepted whether or not Google honours them, so
 * the only proof a search meant what we intended is what the rendered page says
 * about itself. Worth printing on every run.
 */
function occupancyEcho(html: string): string | null {
  // The occupancy control sits well down the document on some layouts.
  const text = plainText(html);
  const match = /((?:\d+|שני|שתי)\s*(?:מבוגרים|מבוגר)[^·|]{0,40})/.exec(text);
  return match?.[1]?.trim() ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const nights = nightsBetween(args.checkin, args.checkout);

  console.log(
    `[2mחופשה: ${args.checkin} → ${args.checkout} (${nights} nights) · ` +
      `${args.adults} adults${args.childAges.length ? `, children aged ${args.childAges.join(', ')}` : ''} · ${args.currency}[0m`,
  );

  if (args.destination) {
    rule(`Flights · ${args.origin} → ${args.destination}`);
    const url = flightSearchUrl(
      roundTrip({
        from: args.origin,
        to: args.destination,
        depart: args.checkin,
        return: args.checkout,
        passengers: passengersFor(args.adults, args.childAges),
        currency: args.currency,
        language: args.language,
      }),
    );
    console.log(`[2m${url}[0m`);

    try {
      const page = await fetchGooglePage(url, { language: `${args.language}-IL,${args.language};q=0.9` });
      const itineraries = parseItineraries(page.html);
      console.log(`[2mfetched ${(page.html.length / 1_048_576).toFixed(1)} MB in ${page.durationMs} ms[0m\n`);

      if (itineraries.length === 0) {
        // Distinguish an empty market from a broken parser: Google prints a
        // plain-language notice when a route simply has no service on the date.
        const notice = /לא נמצאו טיסות|no flights found|אין טיסות/i.test(page.html);
        console.log(notice ? '  Google reports no flights on this route/date' : '  no fares parsed — the page may have changed shape');
      }
      for (const flight of itineraries) {
        console.log(
          `  ${money(flight.price, flight.currency).padStart(9)}  ` +
            `${flight.departTime ?? '--:--'}→${flight.arriveTime ?? '--:--'}  ` +
            `${String(flight.durationMinutes ?? '?').padStart(4)}m  ` +
            `${flight.stops === 0 ? 'direct' : `${flight.stops ?? '?'} stop`}  ` +
            `${(flight.route ?? '').padEnd(9)} ${flight.airline}`,
        );
      }
      const best = cheapestItinerary(itineraries);
      if (best) console.log(`\n  [1mcheapest: ${money(best.price, best.currency)} · ${best.airline}[0m`);
      if (args.save) writeFileSync(`test/fixtures/${args.save}-flights.html.gz`, gzipSync(page.html));
    } catch (error) {
      report(error);
    }
  }

  if (args.hotelQuery) {
    rule(`Hotels · ${args.hotelQuery}`);
    const url = hotelSearchUrl({
      query: args.hotelQuery,
      checkin: args.checkin,
      checkout: args.checkout,
      adults: args.adults,
      childAges: args.childAges,
      currency: args.currency,
      language: args.language,
    });
    console.log(`[2m${url}[0m`);

    try {
      const page = await fetchGooglePage(url, { language: `${args.language}-IL,${args.language};q=0.9` });
      const quotes = parseCompanyQuotes(page.html);
      console.log(`[2mfetched ${(page.html.length / 1_048_576).toFixed(1)} MB in ${page.durationMs} ms[0m`);

      // What the page says about itself. The dates are proven by the `ts`
      // round-trip test; the party is worth echoing because Google will happily
      // accept an occupancy it then ignores.
      const party = occupancyEcho(page.html);
      console.log(`[2mpage reports occupancy: ${party ?? 'not found'}[0m\n`);

      if (quotes.length === 0) console.log('  no company quotes parsed');
      for (const quote of quotes) {
        const perNight = quote.nightly === null ? '' : `${money(quote.nightly, quote.currency)}/night`;
        console.log(
          `  ${money(quote.total, quote.currency).padStart(10)}  ${perNight.padStart(14)}  ` +
            `${quote.freeCancellation ? '[32mfree cancel[0m' : '           '}  ${quote.company}`,
        );
      }
      const winner = quotes[0];
      if (winner) console.log(`\n  [1mcheapest: ${money(winner.total, winner.currency)} · ${winner.company}[0m`);
      if (args.save) writeFileSync(`test/fixtures/${args.save}-hotels.html.gz`, gzipSync(page.html));
    } catch (error) {
      report(error);
    }
  }

  if (!args.destination && !args.hotelQuery) {
    console.log('\nNothing to do. Pass --to <airport|/m/mid> for flights and/or --hotels "<query>".');
  }
}

function report(error: unknown): void {
  if (error instanceof GoogleFetchError) {
    console.error(`  [31m${error.message}[0m${error.retryable ? ' (retryable)' : ''}`);
  } else {
    console.error(`  [31m${error instanceof Error ? error.message : String(error)}[0m`);
  }
  process.exitCode = 1;
}

await main();
