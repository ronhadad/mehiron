/**
 * Is this a good price? Answered from what we have actually observed.
 *
 * The tempting feature here is a forecast — "buy now" or "wait". The published
 * accuracy of the products that do this is around 82–85% within three months
 * and worse than a coin toss beyond it, and the failure mode is expensive: a
 * confident "wait" that is wrong costs the difference. So this does not predict.
 * It says where today's price sits among the prices we have really seen, which
 * is a claim that cannot be wrong.
 *
 * The honesty this buys is worth stating on screen: "the cheapest of the 14
 * times we looked" is a different sentence from "prices will fall".
 */

export type Verdict = 'lowest' | 'cheap' | 'typical' | 'expensive';

export interface Assessment {
  verdict: Verdict;
  /** How many observations it is based on — the reader's guide to trusting it. */
  samples: number;
  low: number;
  high: number;
  /** Fraction of past observations at or above this price, 0–1. */
  betterThan: number;
}

/**
 * Judge the latest price against the ones before it.
 *
 * Fewer than four observations gets no verdict at all. With two or three
 * prices, "the cheapest we have seen" is nearly meaningless — it is the
 * cheapest of two — and dressing that up as a recommendation is how a tracker
 * loses the reader's trust the first time it is wrong.
 */
export function assess(prices: readonly number[]): Assessment | null {
  if (prices.length < 4) return null;

  const current = prices[prices.length - 1];
  if (current === undefined) return null;

  const history = prices.slice(0, -1);
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  const atOrAbove = history.filter((p) => p >= current).length;
  const betterThan = atOrAbove / history.length;

  // A flat series is "typical", not a triumph: when every price is the same,
  // the current one is simultaneously the lowest and the highest, and calling
  // it the lowest would be technically true and useless.
  if (high === low) {
    return { verdict: 'typical', samples: prices.length, low, high, betterThan };
  }

  const verdict: Verdict =
    current <= low ? 'lowest' : betterThan >= 0.75 ? 'cheap' : betterThan <= 0.25 ? 'expensive' : 'typical';

  return { verdict, samples: prices.length, low, high, betterThan };
}

export function verdictLabel(assessment: Assessment): string {
  const { verdict, samples } = assessment;
  if (verdict === 'lowest') return `הזול ביותר מ-${samples} בדיקות`;
  if (verdict === 'cheap') return 'זול מהרגיל';
  if (verdict === 'expensive') return 'יקר מהרגיל';
  return 'מחיר רגיל';
}

/**
 * Money back rather than a missed opportunity.
 *
 * This is the one alert worth interrupting someone for: they have already paid,
 * the same stay is now cheaper, and the booking can still be cancelled for
 * free. Without free cancellation the saving is theoretical, so it is not
 * reported as a saving.
 */
export function rebookingSaving(
  bookedPrice: number | null,
  currentPrice: number | null,
  freeCancellation: boolean,
): number | null {
  if (bookedPrice === null || currentPrice === null) return null;
  if (!freeCancellation) return null;
  const saving = bookedPrice - currentPrice;
  // Round trips and exchange-rate noise produce single-shekel differences that
  // are not worth rebooking for.
  return saving >= 20 ? Math.round(saving) : null;
}
