/**
 * Making Google's Hebrew HTML safe to match against.
 *
 * Google wraps every price in bidirectional control characters so it renders
 * correctly inside right-to-left text: what looks like `898 ₪` is actually
 * `\u200F898 \u200F₪`. Those marks are invisible in a terminal and in a browser,
 * so a regex that plainly should match silently does not — which is exactly how
 * a first pass at this concluded, wrongly, that hotel prices were not in the
 * static HTML at all.
 *
 * Everything that touches Google HTML goes through `plainText` first.
 */

/** LRM, RLM, LRE, RLE, PDF, LRO, RLO, plus the isolate family and the BOM. */
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069﻿]/g;

/** Strip bidi controls without touching anything else. */
export function stripBidi(value: string): string {
  return value.replace(BIDI_MARKS, '');
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // Google's own copy is littered with these. Left raw, a route reads
  // "TLV &ndash; RHO" and every pattern looking for a dash misses it.
  ndash: '–',
  mdash: '—',
  minus: '−',
  hellip: '…',
  middot: '·',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  times: '×',
  deg: '°',
  shy: '',
  nbsp: ' ',
};

/** Minimal entity decoding — Google emits numeric entities and a handful of named ones. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * An HTML fragment as readable text: tags removed, entities decoded, bidi marks
 * dropped, whitespace collapsed.
 *
 * `<script>` and `<style>` bodies are removed first — Google ships hundreds of
 * kilobytes of inline JSON whose stray numbers would otherwise look like prices.
 */
export function plainText(html: string): string {
  const withoutCode = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');

  return collapse(stripBidi(decodeEntities(withoutCode.replace(/<[^>]*>/g, ' '))));
}

/** Collapse runs of whitespace, including the non-breaking kinds Google favours. */
export function collapse(value: string): string {
  return value.replace(/[\s  ]+/g, ' ').trim();
}
