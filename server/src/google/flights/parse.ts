/**
 * Reading itineraries out of a Google Flights results page.
 *
 * Each result is a list item whose text reads, in order: departure and arrival
 * times, the airline, the duration, the route, the stop count, an emissions
 * figure and the fare.
 *
 * Two things about that markup drove the shape of this file. The rows are large
 * — around 19 KB each — and they nest further list items, so matching
 * `<li>…</li>` non-greedily finds the wrong end. And the page renders in the
 * requested locale: `1 hr 40 min · Nonstop · 7:50 PM` in English,
 * `שעה 40 דקות · טיסה ישירה · 19:50` in Hebrew. Both are parsed.
 */
import { parseAllPrices } from '../money.js';
import { plainText } from '../rtl.js';

export interface Itinerary {
  airline: string;
  /** Normalised to 24-hour local time at the departure airport. */
  departTime: string | null;
  arriveTime: string | null;
  /** Total journey time in minutes, across all legs. */
  durationMinutes: number | null;
  stops: number | null;
  price: number;
  currency: string;
  /** `TLV–RHO` when the page prints it. */
  route: string | null;
  /**
   * A stable-enough identity to follow one itinerary across checks. Google gives
   * no id, so this is airline + departure time + route — what a traveller would
   * use to say "that flight".
   */
  key: string;
}

/* Hebrew letters are not `\w`, so `\b` never forms a boundary beside them —
 * `/\bשעה\b/` silently matches nothing. Hebrew alternatives are therefore
 * anchored on explicit characters and Latin ones keep their `\b`. */

const TIME_12H = /\b(\d{1,2}):([0-5]\d)\s*([AP])\.?M\.?/gi;
const TIME_24H = /\b([0-2]?\d):([0-5]\d)\b/g;

/** `7:50 PM` → `19:50`; a 24-hour time is returned unchanged. */
export function normaliseTimes(text: string): string[] {
  const twelve = [...text.matchAll(TIME_12H)];
  if (twelve.length > 0) {
    return twelve.map((m) => {
      const raw = Number(m[1]);
      const hour = m[3]?.toUpperCase() === 'P' ? (raw % 12) + 12 : raw % 12;
      return `${String(hour).padStart(2, '0')}:${m[2]}`;
    });
  }
  return [...text.matchAll(TIME_24H)].map((m) => `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`);
}

/**
 * Google prints each time twice in a row — once for sighted readers and once for
 * screen readers ("7:50 PM 7:50 PM on Thu, Sep 3"). Collapsing runs keeps
 * departure and arrival distinct instead of both reading as the departure.
 */
function dedupeAdjacent(values: readonly string[]): string[] {
  return values.filter((value, i) => value !== values[i - 1]);
}

/**
 * `שעה 40 דקות`, `שעתיים 20 דקות`, `3 שעות 5 דקות`, `1 hr 40 min`, `45 min`.
 *
 * Hebrew has a dual. One hour is the bare word `שעה`; *two* hours is the single
 * word `שעתיים` with no numeral at all; three or more take a numeral and `שעות`.
 * Missing the dual made every two-hour flight report only its minutes — a
 * 2 h 20 m hop to Athens came back as 20 minutes.
 */
export function parseDuration(text: string): number | null {
  const hours = /(\d+)\s*(?:שעות|שע׳|hr|hours?|h\b)/.exec(text);
  const bareHebrewHour = /(?:^|[\s·])שעה(?=$|[\s·])/.test(text);
  const hebrewDualHours = /(?:^|[\s·])שעתיים(?=$|[\s·])/.test(text);
  const minutes = /(\d+)\s*(?:דקות|דק׳|min(?:utes?)?\b|m\b)/.exec(text);

  const h = hours?.[1] ? Number(hours[1]) : hebrewDualHours ? 2 : bareHebrewHour ? 1 : null;
  const m = minutes?.[1] ? Number(minutes[1]) : null;
  if (h === null && m === null) return null;
  return (h ?? 0) * 60 + (m ?? 0);
}

/** `טיסה ישירה` / `Nonstop` → 0; `עצירה אחת` → 1; `2 עצירות` → 2. */
export function parseStops(text: string): number | null {
  if (/טיסה ישירה|nonstop|non-stop|direct/i.test(text)) return 0;
  if (/עצירה אחת|1 stop\b/i.test(text)) return 1;
  const many = /(\d+)\s*(?:עצירות|stops)/i.exec(text);
  return many?.[1] ? Number(many[1]) : null;
}

/**
 * `TLV Ben Gurion Airport – RHO Αεροδρόμιο Ρόδου` → `TLV–RHO`.
 *
 * The airport names between the codes are full of letters and any alphabet, so
 * the gap is matched loosely and only the two codes are kept.
 */
export function parseRoute(text: string): string | null {
  const match = /\b([A-Z]{3})\b[^–—]{0,80}[–—][^A-Z]{0,60}\b([A-Z]{3})\b/.exec(text);
  return match ? `${match[1]}–${match[2]}` : null;
}

/**
 * The route, read only from the part of the row that follows the duration.
 *
 * Airline names supply their own three-letter uppercase runs — `SKY express`
 * turned a Tel Aviv departure into `SKY–ATH`. Google always prints the airports
 * after the duration, so starting there removes the ambiguity rather than trying
 * to out-guess it.
 */
function routeAfterDuration(text: string): string | null {
  const duration = DURATION_PHRASE.exec(text);
  const tail = duration?.index === undefined ? text : text.slice(duration.index + duration[0].length);
  return parseRoute(tail) ?? parseRoute(text);
}

/**
 * Where the duration phrase starts.
 *
 * `שעה` has to appear in the numbered alternation as well as alone: Hebrew
 * writes ninety minutes as `1 שעה 30 דקות`, and matching only the bare word
 * leaves the stray `1` attached to the airline name.
 */
const DURATION_PHRASE =
  /(?:\d+\s*(?:שעות|שעה|שע׳|hr|hours?|h\b)\s*)(?:\d+\s*(?:דקות|דק׳|min(?:utes?)?\b|m\b))?|(?:שעתיים|שעה)(?=$|[\s·])|\d+\s*(?:דקות|דק׳|min(?:utes?)?\b|m\b)/i;

/**
 * A clock time together with the date Google appends to it.
 *
 * English reads `7:50 PM on Thu, Sep 3`, Hebrew `19:50 בתאריך יום ה׳, 3 בספט׳`.
 * Both have to be consumed whole, or the date ends up prefixed to the airline.
 */
const TIME_WITH_DATE =
  /\d{1,2}:[0-5]\d(?:\s*[AP]\.?M\.?)?(?:\s*(?:on\s+[A-Za-z]{3},?\s*[A-Za-z]{3}\s*\d{1,2}|בתאריך\s+[^\d]{0,14}\d{1,2}\s+[^\s]{2,12}))?/gi;

/**
 * The airline is what sits between the last clock time and the duration.
 *
 * Matching against a list of known carriers would quietly drop anyone not on it,
 * and a results page is exactly where an unfamiliar charter airline turns up
 * holding the cheapest fare. So the field is located by its neighbours instead.
 */
export function parseAirline(text: string): string | null {
  const duration = DURATION_PHRASE.exec(text);
  const head = duration?.index === undefined ? text : text.slice(0, duration.index);

  // Everything after the final time — and after the date Google appends to it —
  // is the carrier.
  const times = [...head.matchAll(TIME_WITH_DATE)];
  const last = times[times.length - 1];
  const tail = last?.index === undefined ? head : head.slice(last.index + last[0].length);

  const candidate = tail.replace(/^[–—\-·,\s]+|[–—\-·,\s]+$/g, '').trim();
  if (candidate && candidate.length >= 2 && candidate.length <= 60) return candidate;

  const operated = /(?:טיסה של|operated by)\s+([^,·]{2,40})/i.exec(text);
  return operated?.[1]?.trim() ?? null;
}

function itineraryFrom(text: string): Itinerary | null {
  const price = parseAllPrices(text, 30)[0];
  if (!price) return null;

  const airline = parseAirline(text);
  if (!airline) return null;

  const times = dedupeAdjacent(normaliseTimes(text));
  const departTime = times[0] ?? null;
  const route = routeAfterDuration(text);

  return {
    airline,
    departTime,
    arriveTime: times[1] ?? null,
    durationMinutes: parseDuration(text),
    stops: parseStops(text),
    price: price.amount,
    currency: price.currency,
    route,
    key: [airline, departTime ?? '?', route ?? '?'].join('|'),
  };
}

/**
 * The text of each list item, without trying to find its true closing tag.
 *
 * Rows nest further list items, so a non-greedy `<li>…</li>` stops early. Taking
 * a generous window from each opening tag instead over-reads into the next row,
 * which is harmless: a row's own fare and times come first, and duplicates
 * collapse on `key`.
 */
function rowTexts(html: string): string[] {
  return html
    .split(/<li\b/i)
    .slice(1)
    .map((chunk) => plainText(chunk.slice(0, 22_000)));
}

/**
 * Every itinerary on the page, cheapest first.
 *
 * Google splits results into "best" and "other" and repeats itineraries between
 * them, so entries are deduplicated on `key`, keeping the cheapest fare seen.
 */
export function parseItineraries(html: string): Itinerary[] {
  const byKey = new Map<string, Itinerary>();

  for (const text of rowTexts(html)) {
    // A fare row always names a currency and a time; chrome and filters do not.
    if (!/[₪$€£]/.test(text) || !/\d{1,2}:[0-5]\d/.test(text)) continue;

    const itinerary = itineraryFrom(text);
    if (!itinerary) continue;

    const seen = byKey.get(itinerary.key);
    if (!seen || itinerary.price < seen.price) byKey.set(itinerary.key, itinerary);
  }

  return [...byKey.values()].sort((a, b) => a.price - b.price);
}

/** The headline number for a vacation: the cheapest fare on the page. */
export function cheapestItinerary(itineraries: readonly Itinerary[]): Itinerary | null {
  return itineraries[0] ?? null;
}
