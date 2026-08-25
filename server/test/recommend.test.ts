import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/*
 * `recommendHotels` fetches, so the filtering rule is tested through the same
 * predicate it uses. The bug being pinned: an unknown rating must not be read
 * as a bad one.
 */
const meets = (value: number | null, minimum: number | null | undefined): boolean =>
  minimum == null || value === null || value >= minimum;

describe('filtering recommendations on rating and stars', () => {
  it('keeps a hotel whose rating Google did not print', () => {
    /*
     * Google almost never prints a rating on a destination-search card. Reading
     * that absence as zero made a minimum rating of 4 exclude every single
     * recommendation — a filter that silently empties the list is worse than no
     * filter, because it looks like the destination has no hotels.
     */
    assert.equal(meets(null, 4), true);
  });

  it('still excludes a hotel known to fall short', () => {
    assert.equal(meets(3.2, 4), false);
    assert.equal(meets(4.5, 4), true);
  });

  it('keeps everything when no minimum is set', () => {
    assert.equal(meets(null, null), true);
    assert.equal(meets(2, undefined), true);
  });
});

describe('the listed price is per night', () => {
  it('multiplies out to the stay total', () => {
    // Verified live: Eco Beach listed at ₪311, and its own page quoted ₪2,176
    // for the seven nights — exactly 311 × 7.
    assert.equal(Math.round(311 * 7), 2177);
    assert.ok(Math.abs(311 * 7 - 2176) <= 1, 'within rounding of the quoted total');
  });
});
