/**
 * Google's own verdict on whether a fare is cheap, printed on the page.
 *
 * The flights page carries a "מדדי מחירים" block saying the prices for this
 * route and these dates are low, ordinary or high right now. It is worth having
 * for one reason: it is the only judgement in this app informed by fares beyond
 * our own history. Our verdict knows the twelve times *we* looked; Google's
 * knows the route.
 *
 * It also costs nothing — it arrives on a page already being fetched for the
 * fares themselves.
 *
 * Deliberately not built: a "buy now or wait" forecast. Published accuracy for
 * those sits around 82–85% inside three months and falls below a coin toss
 * further out, and a confident wrong answer here costs real money.
 */
import { plainText } from '../rtl.js';

export type PriceIndex = 'low' | 'typical' | 'high';

/*
 * The block reads "מדדי מחירים" then "המחירים <adjective> עכשיו". Matching the
 * adjective alone would be wrong: the price-tracking dialog on the same page
 * offers to email you "כשהמחירים נמוכים למסלול…", which is boilerplate about a
 * feature rather than a statement about today's fare. That sentence is the trap
 * here — it says "נמוכים" on every page, whatever the prices are doing.
 */
const INDEX_PHRASE = /המחירים (נמוכים|רגילים|טיפוסיים|גבוהים) עכשיו/;

const WORD_TO_INDEX: Record<string, PriceIndex> = {
  נמוכים: 'low',
  רגילים: 'typical',
  טיפוסיים: 'typical',
  גבוהים: 'high',
};

/** English, for a page served in another language. */
const ENGLISH = /prices are currently (low|typical|high)/i;

export function parsePriceIndex(html: string): PriceIndex | null {
  const text = plainText(html);

  const hebrew = INDEX_PHRASE.exec(text);
  if (hebrew?.[1]) return WORD_TO_INDEX[hebrew[1]] ?? null;

  const english = ENGLISH.exec(text);
  if (english?.[1]) return english[1].toLowerCase() as PriceIndex;

  return null;
}

/** How to say it on screen. */
export function priceIndexLabel(index: PriceIndex): string {
  return index === 'low'
    ? 'Google: המחירים נמוכים עכשיו'
    : index === 'high'
      ? 'Google: המחירים גבוהים עכשיו'
      : 'Google: המחירים רגילים עכשיו';
}
