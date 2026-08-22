import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { asList, decodeParam } from '../protobuf.js';
import { buildTfs, flightSearchUrl, passengersFor, roundTrip } from './url.js';

/**
 * A real search, copied out of the user's browser: Tel Aviv → Rhodes,
 * 3–11 September 2026, two adults and an infant, economy.
 *
 * Every claim this module makes about Google's field numbering is checked against
 * these bytes. If Google changes the schema, this test fails loudly instead of the
 * app quietly searching for the wrong thing.
 */
const CAPTURED =
  'CBwQAhomEgoyMDI2LTA5LTAzKABqBwgBEgNUTFZyDQgCEgkvbS8wN3lmZDAaJhIKMjAyNi0wOS0xMSgAag0IAhIJL20v' +
  'MDd5ZmQwcgcIARIDVExWQAFAAUADSAFwAYIBCwj___________8BmAEB';

const SAME_SEARCH = roundTrip({
  from: 'TLV',
  to: '/m/07yfd0',
  depart: '2026-09-03',
  return: '2026-09-11',
  passengers: ['adult', 'adult', 'infantInSeat'],
});

describe('buildTfs', () => {
  it('reproduces a real captured search byte for byte', () => {
    assert.equal(buildTfs(SAME_SEARCH), CAPTURED);
  });

  it('reads back as the search that was asked for', () => {
    const decoded = decodeParam(buildTfs(SAME_SEARCH));
    const slices = asList(decoded[3]) as Array<Record<number, unknown>>;

    assert.equal(slices.length, 2);
    assert.equal(slices[0]?.[2], '2026-09-03');
    assert.equal(slices[1]?.[2], '2026-09-11');
    // Outbound leaves from the airport and arrives at the region; inbound reverses.
    assert.deepEqual(slices[0]?.[13], { 1: 1, 2: 'TLV' });
    assert.deepEqual(slices[0]?.[14], { 1: 2, 2: '/m/07yfd0' });
    assert.deepEqual(slices[1]?.[13], { 1: 2, 2: '/m/07yfd0' });
    assert.deepEqual(slices[1]?.[14], { 1: 1, 2: 'TLV' });

    assert.deepEqual(decoded[8], [1, 1, 3], 'one repeated entry per traveller');
    assert.equal(decoded[9], 1, 'economy');
  });

  it('distinguishes an airport code from a Knowledge Graph entity', () => {
    const decoded = decodeParam(
      buildTfs({ slices: [{ date: '2026-09-03', from: { code: 'TLV' }, to: { code: 'ATH' } }], passengers: ['adult'] }),
    );
    // asList, not a cast: a single slice decodes as a bare value, not an array.
    const slice = asList(decoded[3])[0] as Record<number, unknown>;
    assert.deepEqual(slice?.[13], { 1: 1, 2: 'TLV' });
    assert.deepEqual(slice?.[14], { 1: 1, 2: 'ATH' });
  });

  it('changes the payload when the party changes', () => {
    // Guards the failure mode where occupancy is accepted and then ignored: two
    // different parties must never produce the same URL.
    const one = buildTfs({ ...SAME_SEARCH, passengers: ['adult'] });
    const two = buildTfs({ ...SAME_SEARCH, passengers: ['adult', 'adult'] });
    assert.notEqual(one, two);
  });

  it('always asks for the results view', () => {
    // Proven against Google: 1 lands on the generic search page and 3 on
    // explore-everywhere. Only 2 returns fares.
    assert.equal(decodeParam(buildTfs(SAME_SEARCH))[2], 2);
    assert.equal(
      decodeParam(buildTfs({ slices: [{ date: '2026-09-03', from: { code: 'TLV' }, to: { code: 'ATH' } }], passengers: ['adult'] }))[2],
      2,
    );
  });

  it('carries the cabin', () => {
    assert.equal(decodeParam(buildTfs({ ...SAME_SEARCH, cabin: 'business' }))[9], 3);
  });

  it('refuses an empty search rather than returning a URL for everywhere', () => {
    assert.throws(() => buildTfs({ slices: [], passengers: ['adult'] }));
    assert.throws(() => buildTfs({ ...SAME_SEARCH, passengers: [] }));
  });
});

describe('flightSearchUrl', () => {
  it('builds a complete results URL with market and currency', () => {
    const url = new URL(flightSearchUrl({ ...SAME_SEARCH, currency: 'ILS', language: 'he', country: 'il' }));
    assert.equal(url.pathname, '/travel/flights/search');
    assert.equal(url.searchParams.get('tfs'), CAPTURED);
    assert.equal(url.searchParams.get('curr'), 'ILS');
    assert.equal(url.searchParams.get('hl'), 'he');
    assert.equal(url.searchParams.get('gl'), 'il');
  });
});

describe('passengersFor', () => {
  it('puts an under-two on a lap and an older child in a seat', () => {
    // Google prices the two very differently, so the age must decide it.
    assert.deepEqual(passengersFor(2, [1]), ['adult', 'adult', 'infantOnLap']);
    assert.deepEqual(passengersFor(2, [8]), ['adult', 'adult', 'child']);
    assert.deepEqual(passengersFor(2, [1, 8]), ['adult', 'adult', 'infantOnLap', 'child']);
  });

  it('always sends at least one traveller', () => {
    assert.deepEqual(passengersFor(0), ['adult']);
  });
});
