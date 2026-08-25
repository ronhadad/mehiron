import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assess, rebookingSaving } from '../src/domain/verdict.js';

describe('judging a price against what we have seen', () => {
  it('says nothing at all from too few observations', () => {
    // "The cheapest of two" is not a finding, and presenting it as one is how a
    // tracker loses trust the first time it turns out wrong.
    for (const n of [0, 1, 2, 3]) {
      assert.equal(assess(Array.from({ length: n }, (_, i) => 100 + i)), null, `${n} samples`);
    }
  });

  it('calls a new low the lowest', () => {
    const a = assess([500, 480, 520, 460, 440]);
    assert.equal(a?.verdict, 'lowest');
    assert.equal(a?.low, 440);
    assert.equal(a?.samples, 5);
  });

  it('calls a price under most of the history cheap', () => {
    const a = assess([600, 590, 580, 570, 500]);
    // Below every past price but equal to none of them: still the lowest here.
    assert.equal(a?.verdict, 'lowest');
    const b = assess([600, 400, 590, 580, 450]);
    assert.equal(b?.verdict, 'cheap');
  });

  it('calls a price above most of the history expensive', () => {
    assert.equal(assess([400, 410, 420, 430, 900])?.verdict, 'expensive');
  });

  it('calls the middle typical', () => {
    assert.equal(assess([100, 200, 300, 400, 250])?.verdict, 'typical');
  });

  it('calls a flat series typical, not a new low', () => {
    // Every price identical makes the current one both lowest and highest.
    // Announcing "cheapest ever" there would be true and worthless.
    const a = assess([300, 300, 300, 300]);
    assert.equal(a?.verdict, 'typical');
  });
});

describe('rebooking a stay that got cheaper', () => {
  it('reports the saving when the booking can still be cancelled free', () => {
    assert.equal(rebookingSaving(4000, 3500, true), 500);
  });

  it('reports nothing without free cancellation, because the saving is theoretical', () => {
    assert.equal(rebookingSaving(4000, 3500, false), null);
  });

  it('ignores noise not worth rebooking for', () => {
    assert.equal(rebookingSaving(4000, 3995, true), null);
  });

  it('reports nothing when the price went up, or when either side is unknown', () => {
    assert.equal(rebookingSaving(3500, 4000, true), null);
    assert.equal(rebookingSaving(null, 3500, true), null);
    assert.equal(rebookingSaving(4000, null, true), null);
  });
});
