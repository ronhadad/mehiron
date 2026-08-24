/**
 * Real Google HTML, captured once and checked in.
 *
 * Parsers are tested against these rather than against the live site: the page
 * changes hourly, the network is not always there, and a test that hits Google
 * on every run is a test nobody runs. Stored gzipped — the pages are 2–3 MB each.
 *
 * To refresh one, run the probe with `--save <name>`.
 */
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function fixture(name: string): string {
  const path = fileURLToPath(new URL(`./fixtures/${name}.html.gz`, import.meta.url));
  return gunzipSync(readFileSync(path)).toString('utf8');
}

/** Tel Aviv → Rhodes, 3–11 September 2026, two adults and an infant, in USD. */
export const FLIGHTS_TLV_RHO = 'flights-tlv-rho-2026-09-03';

/** Isrotel King Solomon, Eilat, 17–21 February 2027, two adults, in ILS. */
export const HOTELS_KING_SOLOMON = 'hotels-king-solomon-2027-02-17';

/**
 * A deliberately inexact hotel search: "dandrea mare rhodes", 22–29 September
 * 2026, two adults. Google resolves it to D'Andrea Mare Beach Hotel and lists
 * eight other Rhodes hotels beside it — the exact case the completion exists for.
 */
export const HOTELS_SEARCH_RHODES = 'hotels-search-rhodes';
