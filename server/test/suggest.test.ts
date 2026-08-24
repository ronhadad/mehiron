import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHotelSuggestions } from '../src/google/hotels/suggest.js';
import { decodeParam } from '../src/google/protobuf.js';
import { fixture, HOTELS_SEARCH_RHODES } from './fixtures.js';

describe('completing a hotel name from Google', () => {
  const suggestions = parseHotelSuggestions(fixture(HOTELS_SEARCH_RHODES));

  it('offers the hotel that was actually meant, first', () => {
    /*
     * The whole point: "dandrea mare rhodes" is not what Google calls the place.
     * The resolved hotel is rendered as a detail panel rather than a card, so it
     * has no `<span dir="ltr">` and was silently dropped until its name was read
     * from the anchor's aria-label instead.
     */
    assert.equal(suggestions[0]?.primary, true);
    assert.match(suggestions[0]?.name ?? '', /Andrea Mare Beach Hotel/);
  });

  it('offers the nearby hotels too, and only one of them is the resolved one', () => {
    assert.ok(suggestions.length >= 6, `expected several suggestions, got ${suggestions.length}`);
    assert.equal(suggestions.filter((s) => s.primary).length, 1);
  });

  it('gives every suggestion an entity id that decodes to a Google place', () => {
    for (const suggestion of suggestions) {
      const decoded = decodeParam(suggestion.entityId) as Record<number, Record<number, unknown>>;
      // `{1:{1:<numeric id>, 3:"/g/…"}, 2:1}` — the mid is what makes this stable.
      assert.match(String(decoded[1]?.[3] ?? ''), /^\/g\//, `no mid in ${suggestion.entityId}`);
    }
  });

  it('decodes the entities in a name, or the saved name never matches', () => {
    // "Resort &amp; Spa" saved verbatim would be searched with the ampersand
    // escaped and would not be found again.
    const ampersands = suggestions.filter((s) => s.name.includes('&'));
    assert.ok(ampersands.length > 0, 'expected at least one name with an ampersand');
    for (const s of ampersands) assert.ok(!s.name.includes('&amp;'), `undecoded entity in "${s.name}"`);
  });

  it('reads the price beside a suggestion, so the list shows what will be tracked', () => {
    const priced = suggestions.filter((s) => s.price !== null);
    assert.ok(priced.length >= 3, `expected several priced suggestions, got ${priced.length}`);
    for (const s of priced) {
      assert.ok(s.price! > 20, `${s.name} priced at ${s.price}`);
      assert.equal(s.currency, 'ILS');
    }
  });

  it('lists each hotel once, though Google repeats them across the page', () => {
    const ids = suggestions.map((s) => s.entityId);
    assert.equal(new Set(ids).size, ids.length);
  });
});
