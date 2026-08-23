# מחירון

Watches what a holiday costs — flights and hotels together — by reading Google
Flights and Google Hotels, and keeps the history of every booking company Google
compares.

No browser. Both products render their prices into the initial HTML, so an
ordinary HTTP request is enough. A search takes under a second.

## Running it

Node 20 or newer. From this directory:

```sh
npm install
```

Then price a holiday:

```sh
npm run probe -- --to ATH --hotels "ישרוטל ים סוף אילת" \
                 --from 2026-10-04 --to-date 2026-10-08 --adults 2
```

```
חופשה: 2026-10-04 → 2026-10-08 (4 nights) · 2 adults · ILS

Flights · TLV → ATH                       fetched 2.2 MB in 702 ms
   ₪1,089  12:55→15:15  140m  direct  TLV–ATH  Wizz Air
   ₪1,241  17:15→19:25  130m  direct  TLV–ATH  Bluebird Airways
   ₪2,580  19:30→21:40  130m  direct  TLV–ATH  אל על
   cheapest: ₪1,089 · Wizz Air

Hotels · ישרוטל ים סוף אילת                fetched 2.6 MB in 1126 ms
   ₪4,312   ₪1,078/night  free cancel  Booking.com
   cheapest: ₪4,312 · Booking.com
```

### Options

| Flag | Meaning | Default |
| --- | --- | --- |
| `--to` | Destination: an airport code (`ATH`) or a Google entity (`/m/07yfd0` = Rhodes). Omit to skip flights. | — |
| `--hotels` | Hotel or area to price. Omit to skip hotels. | — |
| `--origin` | Departure airport | `TLV` |
| `--from` / `--to-date` | Check-in and check-out, `YYYY-MM-DD` | `2026-09-03` / `2026-09-11` |
| `--adults` | Adults | `2` |
| `--children` | Comma-separated ages, e.g. `1,8`. Under two flies on a lap. | none |
| `--currency` | ISO code | `ILS` |
| `--lang` | `he` or `en` | `he` |
| `--save <name>` | Also write the raw HTML to `server/test/fixtures/` as a new test fixture | — |

Everything else — the database, the schedule, the web UI — is still being built.
The probe is how the pipeline is exercised until then.

## Checking your work

```sh
npm run verify     # typecheck + tests
```

Tests never touch the network. Parsers run against real Google HTML captured
into `server/test/fixtures/`, and the URL builders re-encode real captured search
URLs and assert the bytes come back identical.

## How a search is built

Google puts the entire query — dates, travellers, currency — inside one
base64url protobuf: `tfs` for Flights, `ts` for Hotels. Nothing else in the URL
matters. In particular **`?checkin=…&checkout=…` is accepted and then ignored**:
you get HTTP 200, real prices, and the wrong stay. That is why both builders are
pinned by round-trip tests against URLs Google produced for itself.

## Known limits

- **Flights: only the "best" fares are in the static HTML.** Google's "other
  departing flights" rows arrive by XHR, so a browser sees ~16 and a plain fetch
  sees between 3 and 11 depending on the route. The cheapest is always present.
- **Hotels: the featured companies only.** The search page carries two to four
  partners. The full "כל האפשרויות" list needs a second request, not yet built.
- A seasonal route with no service returns nothing; the probe distinguishes that
  from a parser failure.

## Layout

```
server/src/google/
  protobuf.ts          varint + length-delimited codec (no dependency)
  rtl.ts               strips the bidi marks Google wraps prices in
  money.ts             price parsing, symbol on either side
  fetch.ts             polite HTTP: one request at a time, backoff, block detection
  flights/url.ts       tfs encoder      flights/parse.ts   HTML → itineraries
  hotels/url.ts        ts encoder       hotels/parse.ts    HTML → company quotes
server/src/cli/probe.ts
server/test/           fixtures + golden tests
```
