import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePriceIndex } from '../src/google/flights/insight.js';

describe("Google's own price index", () => {
  it('reads high, low and typical', () => {
    assert.equal(parsePriceIndex('<div>מדדי מחירים המחירים גבוהים עכשיו</div>'), 'high');
    assert.equal(parsePriceIndex('<div>המחירים נמוכים עכשיו</div>'), 'low');
    assert.equal(parsePriceIndex('<div>המחירים רגילים עכשיו</div>'), 'typical');
  });

  it('is not fooled by the price-tracking dialog', () => {
    /*
     * The trap: every flights page offers to email you "כשהמחירים נמוכים
     * למסלול…". That is boilerplate describing a feature, not a statement about
     * today's fare, and matching the adjective alone would report "low" on every
     * page — including this one, where prices are high.
     */
    const page = `<div>קבלת עדכונים באימייל כשהמחירים נמוכים למסלול תל אביב-יפו – האי רודוס</div>
                  <div>מדדי מחירים המחירים גבוהים עכשיו</div>`;
    assert.equal(parsePriceIndex(page), 'high');
  });

  it('returns null when the page says nothing about it', () => {
    assert.equal(parsePriceIndex('<div>טיסות זולות</div>'), null);
  });

  it('reads an English page too', () => {
    assert.equal(parsePriceIndex('<div>Prices are currently typical</div>'), 'typical');
  });
});
