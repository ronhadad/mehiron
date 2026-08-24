/**
 * Completing a half-remembered hotel name from Google itself.
 *
 * Typing "dandrea mare rhodes" finds the hotel, but the name Google prices it
 * under is "D'Andrea Mare Beach Hotel" — and a query that is merely close often
 * returns a page with no partner prices at all. So the name is never typed
 * blind: Google's own search is asked, and what comes back is its canonical
 * name plus the entity id it prices under.
 *
 * The entity id is the important part. `/travel/hotels/entity/<id>` decodes to
 * `{1:{1:<numeric id>, 3:"/g/11z9l6r4w"}, 2:1}` — a Knowledge Graph mid — so a
 * watched hotel is pinned to an identifier rather than to a string that Google
 * may word differently tomorrow.
 */
import { parseAllPrices } from '../money.js';
import { collapse, decodeEntities, plainText, stripBidi } from '../rtl.js';
import { parseRating, parseStars } from './parse.js';

export interface HotelSuggestion {
  /** Google's own name for the place — what to save. */
  name: string;
  /** `/travel/hotels/entity/<entityId>`; stable, and what pricing uses. */
  entityId: string;
  price: number | null;
  currency: string | null;
  rating: number | null;
  ratingCount: number | null;
  stars: number | null;
  /** "במרחק 0.8 ק"מ" when Google shows it. */
  distance: string | null;
  /**
   * True for the hotel Google resolved the query *to*, as opposed to the ones it
   * merely suggests alongside. Typing "dandrea mare" resolves to D'Andrea Mare
   * Beach Hotel and lists eight other Rhodes hotels next to it; only the first
   * is what was being asked for, so it is returned first and flagged.
   */
  primary: boolean;
}

/**
 * The name inside one hotel card.
 *
 * Google marks a Latin-script name with `<span dir="ltr">`, which is semantic
 * and survives its CSS class churn. Hebrew names carry no such marker, so the
 * fallback is the first readable line after the price — the class names are
 * deliberately not used, because they are obfuscated and rotate.
 */
function nameIn(card: string): string | null {
  const ltr = /<span dir="ltr">([^<]{2,90})<\/span>/.exec(card);
  // `&amp;` is common in hotel names ('Resort &amp; Spa') and must be decoded
  // or the saved name never matches Google's.
  if (ltr?.[1]) return collapse(decodeEntities(stripBidi(ltr[1])));

  // Drop the price block, then take the first substantial line.
  const text = plainText(card.replace(/<div class="guXA2e"[\s\S]{0,600}?<\/div>/, ' '));
  const candidate = text
    .split(/\s{2,}|·/)
    .map((s) => s.trim())
    .find((s) => s.length >= 3 && s.length <= 90 && !/^[₪$€\d]/.test(s));
  return candidate ?? null;
}

/**
 * Names taken from the anchors' own `aria-label`.
 *
 * The resolved hotel is rendered as a detail panel rather than a card, so it has
 * no `<span dir="ltr">` to read — its name lives only in "פתיחת <name> בכרטיסייה
 * חדשה". That label is localised, which is fine because every request pins
 * `hl`, and both spellings are stripped so an English page works too.
 */
function labelledNames(html: string): Map<string, string> {
  const names = new Map<string, string>();

  for (const match of html.matchAll(/<a\b[^>]*aria-label="([^"]{4,160})"[^>]*href="\/travel\/hotels\/entity\/([A-Za-z0-9_-]+)/g)) {
    const raw = collapse(decodeEntities(stripBidi(match[1] ?? '')));
    const id = match[2];
    if (!id) continue;
    const name = raw
      .replace(/^פתיחת\s+/, '')
      .replace(/\s+בכרטיסייה חדשה$/, '')
      .replace(/^Open\s+/i, '')
      .replace(/\s+in a new tab$/i, '')
      .trim();
    if (name.length >= 3 && !names.has(id)) names.set(id, name);
  }

  return names;
}

/**
 * Hotels Google offers for this text, the resolved one first.
 *
 * Deduplicated on the entity id: Google repeats a hotel across the detail panel,
 * the map strip and the "people also viewed" rail.
 */
export function parseHotelSuggestions(html: string, limit = 8): HotelSuggestion[] {
  const found = new Map<string, HotelSuggestion>();
  const labelled = labelledNames(html);
  // The detail panel is the resolved hotel, and it is the first anchor that
  // carries a label.
  const primaryId = [...labelled.keys()][0] ?? null;

  for (const chunk of html.split('href="/travel/hotels/entity/').slice(1)) {
    const entityId = /^([A-Za-z0-9_-]+)/.exec(chunk)?.[1];
    if (!entityId) continue;

    // The card is the anchor's contents; a generous window covers it without
    // needing to balance tags.
    const card = chunk.slice(0, 2_600);
    const name = labelled.get(entityId) ?? nameIn(card);
    if (!name) continue;

    const money = parseAllPrices(card, 20)[0] ?? null;
    const text = plainText(card);
    const { rating, count } = parseRating(text);
    const distance = /במרחק [\d.,]+ ק"מ|[\d.,]+ km away/.exec(text)?.[0] ?? null;

    const existing = found.get(entityId);
    // Keep the sighting that carries a price; the map strip often has none.
    if (existing && (existing.price !== null || money === null)) continue;

    found.set(entityId, {
      name,
      entityId,
      price: money?.amount ?? null,
      currency: money?.currency ?? null,
      rating,
      ratingCount: count,
      stars: parseStars(text),
      distance,
      primary: entityId === primaryId,
    });
  }

  const all = [...found.values()];
  // The hotel actually asked for leads, whatever order the markup used.
  all.sort((a, b) => Number(b.primary) - Number(a.primary));
  return all.slice(0, limit);
}
