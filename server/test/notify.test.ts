import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeMessage, isGone, type Alert } from '../src/domain/notify.js';

const drop = (over: Partial<Alert> = {}): Alert => ({
  kind: 'drop',
  vacationId: 'v1',
  vacationName: 'רודוס בספטמבר',
  optionId: 'o1',
  title: 'Sun Beach Resort',
  from: 4248,
  to: 3566,
  currency: 'ILS',
  ...over,
});

describe('the message for a price drop', () => {
  it('says nothing when nothing fell', () => {
    // The notification that must never be sent: the one about no news.
    assert.equal(composeMessage([]), null);
  });

  it('names the hotel and the saving for a single drop', () => {
    const m = composeMessage([drop()]);
    assert.ok(m);
    assert.match(m.title, /682/);
    assert.match(m.title, /Sun Beach Resort/);
    assert.match(m.body, /רודוס בספטמבר/);
    assert.equal(m.url, '/vacations/v1');
  });

  it('leads with the biggest saving, not the first one found', () => {
    const m = composeMessage([
      drop({ title: 'קטן', from: 1000, to: 950 }),
      drop({ title: 'גדול', from: 5000, to: 3000 }),
      drop({ title: 'בינוני', from: 2000, to: 1700 }),
    ]);
    assert.ok(m);
    assert.match(m.title, /גדול/, 'the largest drop is the headline');
    assert.match(m.title, /2,000/, 'and its saving, not the total');
    assert.match(m.body, /2 עדכונים/, 'the rest are counted, not listed');
  });

  it('links to the list when more than one vacation is involved', () => {
    const m = composeMessage([drop(), drop({ vacationId: 'v2', optionId: 'o2' })]);
    assert.equal(m?.url, '/');
  });

  it('links to the one vacation when every drop is inside it', () => {
    const m = composeMessage([drop(), drop({ optionId: 'o2', title: 'אחר' })]);
    assert.equal(m?.url, '/vacations/v1');
  });
});

describe('pruning dead subscriptions', () => {
  it('treats 404 and 410 as gone for good', () => {
    assert.equal(isGone(404), true);
    assert.equal(isGone(410), true);
  });

  it('keeps a subscription through anything that might be transient', () => {
    // Deleting on a 500 or a timeout would quietly unsubscribe someone because
    // a push service had a bad minute.
    for (const status of [0, 429, 500, 502, 503]) {
      assert.equal(isGone(status), false, String(status));
    }
  });
});

describe('which alert leads the notification', () => {
  /*
   * Ranked by what the reader can do about it, not by size. A ₪200 rebooking
   * expires when free cancellation does; a ₪900 drop on something nobody booked
   * can be looked at tomorrow.
   */
  it('puts a rebooking ahead of a much larger plain drop', () => {
    const m = composeMessage([
      drop({ title: 'ירידה גדולה', from: 5000, to: 4100 }),
      drop({ kind: 'rebook', title: 'המלון שהזמנו', from: 4000, to: 3800, freeCancellation: true }),
    ]);
    assert.match(m!.title, /המלון שהזמנו/);
    assert.match(m!.title, /200/);
  });

  it('puts a target the reader set ahead of a drop they did not ask about', () => {
    const m = composeMessage([
      drop({ title: 'ירידה', from: 3000, to: 2000 }),
      drop({ kind: 'target', title: 'הטיסה', from: 2500, to: 2400, target: 2500 }),
    ]);
    assert.match(m!.title, /הטיסה/);
    assert.match(m!.title, /🎯/);
  });

  it('says the booking can still be cancelled free, when it can', () => {
    const free = composeMessage([drop({ kind: 'rebook', from: 4000, to: 3500, freeCancellation: true })]);
    assert.match(free!.body, /הביטול עדיין חינם/);
    // A flight is usually not cancellable, so the terms are reported rather
    // than promised — claiming a refund that is not available is worse than
    // saying nothing.
    const paid = composeMessage([drop({ kind: 'rebook', from: 4000, to: 3500, freeCancellation: false })]);
    assert.match(paid!.body, /תנאי הכרטיס/);
  });
});
