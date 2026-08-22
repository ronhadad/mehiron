/**
 * Reading prices out of Google's text.
 *
 * Ported from the previous app's price parser, which earned its regressions the
 * hard way, with two changes for Google: the symbol usually *follows* the number
 * in Hebrew (`898 ₪`), and bidi marks have to be gone before matching — see
 * `rtl.ts`.
 */
import { collapse, stripBidi } from './rtl.js';

const SYMBOLS: Record<string, string> = {
  '₪': 'ILS',
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₺': 'TRY',
  '₽': 'RUB',
  '¥': 'JPY',
  '₹': 'INR',
};

const CODES = new Set([
  'ILS', 'NIS', 'USD', 'EUR', 'GBP', 'TRY', 'CHF', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'AED', 'JPY', 'CAD', 'AUD',
]);

export interface Money {
  amount: number;
  currency: string;
}

const SYMBOL_CLASS = Object.keys(SYMBOLS)
  .map((s) => s.replace(/[$]/g, '\\$'))
  .join('');

/*
 * A number is either grouped thousands (1,234 / 1.234,56) or a plain decimal.
 * The grouped alternative needs `+`, not `*`: with `*` the parser matched "263"
 * out of "2630" and then read the following "0" as part of the currency.
 */
const NUMBER = String.raw`\d{1,3}(?:[.,   ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;

const WITH_SYMBOL = new RegExp(
  String.raw`(?:(?<pre>[${SYMBOL_CLASS}]|\b[A-Z]{3}\b)\s*(?<numA>${NUMBER}))` +
    String.raw`|(?:(?<numB>${NUMBER})\s*(?<post>[${SYMBOL_CLASS}]|\b[A-Z]{3}\b))`,
  'u',
);

/**
 * Interpret `.` and `,` without knowing the locale.
 *
 * Whichever separator appears last is the decimal point when both are present.
 * With only one, exactly three trailing digits means it grouped thousands —
 * `1,234` is one thousand two hundred and thirty-four, not 1.234.
 */
function toNumber(raw: string): number | null {
  const text = raw.replace(/[   ]/g, '');
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  let normalised: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalised = text.split(thousands).join('').replace(decimal, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const tail = text.slice(text.lastIndexOf(sep) + 1);
    normalised = tail.length === 3 ? text.split(sep).join('') : text.replace(sep, '.');
  } else {
    normalised = text;
  }

  const value = Number.parseFloat(normalised);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function currencyOf(token: string | undefined): string | null {
  if (!token) return null;
  const symbol = SYMBOLS[token];
  if (symbol) return symbol;
  const code = token.toUpperCase();
  if (!CODES.has(code)) return null;
  return code === 'NIS' ? 'ILS' : code;
}

/**
 * The first price in a string, or null.
 *
 * A bare number is deliberately rejected: Google's text is full of review counts,
 * star ratings, durations and distances, and treating any of them as a price is
 * how a tracker ends up watching ₪13.
 */
export function parsePrice(text: string): Money | null {
  const match = WITH_SYMBOL.exec(collapse(stripBidi(text)));
  if (!match?.groups) return null;

  const { pre, post, numA, numB } = match.groups;
  const currency = currencyOf(pre ?? post);
  const amount = toNumber((numA ?? numB) as string);
  return currency && amount !== null ? { amount, currency } : null;
}

/** Every distinct price in a string, cheapest first. */
export function parseAllPrices(text: string, minimum = 1): Money[] {
  const clean = collapse(stripBidi(text));
  const global = new RegExp(WITH_SYMBOL.source, 'gu');
  const seen = new Map<string, Money>();

  for (const match of clean.matchAll(global)) {
    const g = match.groups;
    if (!g) continue;
    const currency = currencyOf(g['pre'] ?? g['post']);
    const amount = toNumber((g['numA'] ?? g['numB']) as string);
    if (!currency || amount === null || amount < minimum) continue;
    seen.set(`${currency}:${amount}`, { amount, currency });
  }

  return [...seen.values()].sort((a, b) => a.amount - b.amount);
}
