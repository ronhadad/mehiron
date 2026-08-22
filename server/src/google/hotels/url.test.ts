import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeParam } from '../protobuf.js';
import { buildTs, hotelSearchUrl, nightsBetween } from './url.js';

/**
 * Captured by driving Google's own date picker and reading the URL it produced:
 * 17–21 February 2027, two adults, priced in shekels.
 */
const CAPTURED = 'CAAaGhIYEhIKBwjrDxACGBESBwjrDxACGBUyAggCKgcKBToDSUxT';

describe('buildTs', () => {
  it('reproduces the URL Google built for itself', () => {
    assert.equal(
      buildTs({ query: 'ישרוטל המלך שלמה אילת', checkin: '2027-02-17', checkout: '2027-02-21', adults: 2 }),
      CAPTURED,
    );
  });

  it('encodes each date as year, month and day rather than a string', () => {
    const stay = (decodeParam(CAPTURED)[3] as Record<number, Record<number, Record<number, unknown>>>)[2]?.[2];
    assert.deepEqual(stay?.[1], { 1: 2027, 2: 2, 3: 17 });
    assert.deepEqual(stay?.[2], { 1: 2027, 2: 2, 3: 21 });
  });

  it('changes the payload when the dates change', () => {
    // The whole reason this module exists: `?checkin=` is accepted and ignored,
    // so two different stays must never produce the same `ts`.
    const feb = buildTs({ query: 'x', checkin: '2027-02-17', checkout: '2027-02-21', adults: 2 });
    const sep = buildTs({ query: 'x', checkin: '2026-09-03', checkout: '2026-09-11', adults: 2 });
    assert.notEqual(feb, sep);
  });

  it('changes the payload when the party changes', () => {
    const base = { query: 'x', checkin: '2026-09-03', checkout: '2026-09-11' };
    const two = buildTs({ ...base, adults: 2 });
    const three = buildTs({ ...base, adults: 3 });
    const withChild = buildTs({ ...base, adults: 2, childAges: [8] });
    assert.notEqual(two, three);
    assert.notEqual(two, withChild);
  });

  it('carries every child age, because Google prices them by age', () => {
    const decoded = decodeParam(
      buildTs({ query: 'x', checkin: '2026-09-03', checkout: '2026-09-11', adults: 2, childAges: [1, 8] }),
    );
    const occupancy = (decoded[3] as Record<number, Record<number, Record<number, unknown>>>)[2]?.[6];
    assert.equal(occupancy?.[1], 2);
    assert.deepEqual(occupancy?.[2], [1, 8]);
  });

  it('carries the currency', () => {
    const decoded = decodeParam(
      buildTs({ query: 'x', checkin: '2026-09-03', checkout: '2026-09-11', adults: 2, currency: 'EUR' }),
    );
    assert.deepEqual(decoded[5], { 1: { 7: 'EUR' } });
  });

  it('rejects a malformed date instead of searching for something else', () => {
    assert.throws(() => buildTs({ query: 'x', checkin: '03/09/2026', checkout: '2026-09-11', adults: 2 }));
  });
});

describe('hotelSearchUrl', () => {
  it('puts the query in q and everything else in ts', () => {
    const url = new URL(
      hotelSearchUrl({ query: 'ישרוטל המלך שלמה אילת', checkin: '2027-02-17', checkout: '2027-02-21', adults: 2 }),
    );
    assert.equal(url.pathname, '/travel/search');
    assert.equal(url.searchParams.get('q'), 'ישרוטל המלך שלמה אילת');
    assert.equal(url.searchParams.get('ts'), CAPTURED);
    assert.equal(url.searchParams.get('curr'), 'ILS');
  });
});

describe('nightsBetween', () => {
  it('counts nights, not days', () => {
    assert.equal(nightsBetween('2026-09-03', '2026-09-11'), 8);
    assert.equal(nightsBetween('2027-02-17', '2027-02-21'), 4);
  });

  it('survives a daylight-saving change', () => {
    // Israel's clocks go back in late October; a UTC-based subtraction gives 7.96
    // days here and rounds wrong without local-midnight parsing.
    assert.equal(nightsBetween('2026-10-22', '2026-10-30'), 8);
  });

  it('never returns zero, so a nightly rate can always be derived', () => {
    assert.equal(nightsBetween('2026-09-03', '2026-09-03'), 1);
  });
});
