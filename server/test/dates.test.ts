import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fromIso, nights, toIso } from '../src/domain/dates.js';

describe('stay dates', () => {
  it('round-trips a date without slipping a day', () => {
    for (const iso of ['2026-09-22', '2026-01-01', '2026-12-31', '2027-02-28', '2028-02-29']) {
      assert.equal(toIso(fromIso(iso)), iso, iso);
    }
  });

  it('stores at midday, so no timezone can move the date', () => {
    /*
     * The failure this prevents: a date-only value parsed at UTC midnight reads
     * back as the previous day anywhere behind UTC, which silently shifts a stay
     * and makes every price a price for the wrong night.
     */
    assert.equal(fromIso('2026-09-22').getUTCHours(), 12);
  });

  it('counts nights, not days', () => {
    assert.equal(nights(fromIso('2026-09-22'), fromIso('2026-09-29')), 7);
    assert.equal(nights(fromIso('2027-02-17'), fromIso('2027-02-21')), 4);
  });

  it('counts nights correctly across a daylight-saving change', () => {
    // Israel's clocks go back in late October; a local-midnight subtraction
    // gives 8.04 days here and can round wrong.
    assert.equal(nights(fromIso('2026-10-22'), fromIso('2026-10-30')), 8);
  });

  it('counts nights across a year boundary and a leap day', () => {
    assert.equal(nights(fromIso('2026-12-28'), fromIso('2027-01-04')), 7);
    assert.equal(nights(fromIso('2028-02-27'), fromIso('2028-03-01')), 3);
  });

  it('refuses a date it cannot trust rather than guessing', () => {
    for (const bad of ['22/09/2026', '2026-9-22', 'tomorrow', '']) {
      assert.throws(() => fromIso(bad), `should reject "${bad}"`);
    }
  });
});
