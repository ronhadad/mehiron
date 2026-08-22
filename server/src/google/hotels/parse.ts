/**
 * Reading hotel prices and their booking companies out of Google's HTML.
 *
 * Google marks each booking partner with `data-id="j2tiVc_<company>"`, and the
 * block that follows carries that company's nightly rate, the stay total and its
 * cancellation terms. This is the whole reason the app moved to Google: one
 * request yields the cross-company comparison that previously needed a separate
 * scraper per site.
 *
 * Everything goes through `plainText` first — the prices are wrapped in
 * bidirectional control characters and are invisible to a naive regex.
 */
import { parseAllPrices } from '../money.js';
import { plainText } from '../rtl.js';

export interface CompanyQuote {
  /** `Booking.com`, `Agoda`, `Vio.com`, `אתר המלון`… */
  company: string;
  /** What the stay costs in total, which is what a tracker follows. */
  total: number;
  /** Per-night rate when Google shows one — it usually shows both. */
  nightly: number | null;
  currency: string;
  freeCancellation: boolean;
  /** The conditions line as printed, e.g. `ביטול בחינם עד 10 בפבר׳`. */
  conditions: string | null;
}

export interface HotelResult {
  name: string;
  quotes: CompanyQuote[];
  /** Cheapest total across companies, or null when nothing was priced. */
  cheapest: CompanyQuote | null;
  rating: number | null;
  ratingCount: number | null;
  stars: number | null;
}

const PARTNER_MARKER = 'data-id="j2tiVc_';

/** Free cancellation, in either language Google might have rendered. */
function hasFreeCancellation(text: string): boolean {
  return /ביטול בחינם|ביטול חינם/.test(text) || /free cancellation/i.test(text);
}

function conditionsOf(text: string): string | null {
  const match = /(ביטול בחינם[^·]{0,40}|ללא דמי ביטול|free cancellation[^·]{0,40})/i.exec(text);
  return match?.[1]?.trim() ?? null;
}

/**
 * Company quotes from one hotel's block of partner offers.
 *
 * Google prints the same price twice — once struck through or as the headline,
 * once as the amount — followed by the stay total. Taking the smallest as the
 * nightly rate and the largest as the total is what survives that repetition,
 * and it degrades sensibly when only one figure is shown.
 */
export function parseCompanyQuotes(html: string): CompanyQuote[] {
  const quotes = new Map<string, CompanyQuote>();

  for (const chunk of html.split(PARTNER_MARKER).slice(1)) {
    const company = plainText(chunk.slice(0, chunk.indexOf('"'))).trim();
    if (!company) continue;

    const body = plainText(chunk.slice(0, 2_600));
    const prices = parseAllPrices(body, 20);
    if (prices.length === 0) continue;

    const nightly = prices[0];
    const total = prices[prices.length - 1];
    if (!nightly || !total) continue;

    const quote: CompanyQuote = {
      company,
      total: total.amount,
      nightly: prices.length > 1 ? nightly.amount : null,
      currency: total.currency,
      freeCancellation: hasFreeCancellation(body),
      conditions: conditionsOf(body),
    };

    // Google repeats a partner across the featured strip and the offer list.
    // Keep the cheapest sighting rather than whichever came last.
    const seen = quotes.get(company);
    if (!seen || quote.total < seen.total) quotes.set(company, quote);
  }

  return [...quotes.values()].sort((a, b) => a.total - b.total);
}

/** `4.4/5 (1.9K)` → rating out of 5 and a review count. */
export function parseRating(text: string): { rating: number | null; count: number | null } {
  const rating = /(\d(?:[.,]\d)?)\s*\/\s*5/.exec(text);
  const count = /\(([\d,.]+)\s*([KM])?\s*\)/i.exec(text);

  let reviews: number | null = null;
  if (count?.[1]) {
    const base = Number.parseFloat(count[1].replace(/,/g, ''));
    const scale = count[2]?.toUpperCase() === 'M' ? 1_000_000 : count[2]?.toUpperCase() === 'K' ? 1_000 : 1;
    if (Number.isFinite(base)) reviews = Math.round(base * scale);
  }

  return {
    rating: rating?.[1] ? Number.parseFloat(rating[1].replace(',', '.')) : null,
    count: reviews,
  };
}

/** `מלון 4 כוכבים` / `4-star hotel`. */
export function parseStars(text: string): number | null {
  const hebrew = /מלון (\d) כוכבים/.exec(text);
  if (hebrew?.[1]) return Number(hebrew[1]);
  const english = /(\d)[- ]star/i.exec(text);
  return english?.[1] ? Number(english[1]) : null;
}

/**
 * One hotel's page: its companies, plus whatever descriptive detail is on it.
 *
 * `name` is taken from the document title rather than the body — Google's search
 * result list repeats dozens of other hotel names in the same markup, and the
 * title is the one place the subject of the page is unambiguous.
 */
export function parseHotelPage(html: string): HotelResult {
  const quotes = parseCompanyQuotes(html);
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  const name = plainText(title).replace(/\s*[–|-]\s*(מלונות דרך Google|Google Hotels).*$/i, '').trim();

  // Rating and stars live near the top of the page body, well before the
  // sponsored strip that carries other hotels' figures.
  const head = plainText(html.slice(0, 400_000));
  const { rating, count } = parseRating(head);

  return {
    name,
    quotes,
    cheapest: quotes[0] ?? null,
    rating,
    ratingCount: count,
    stars: parseStars(head),
  };
}
