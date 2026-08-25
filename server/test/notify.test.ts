import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeMessage, isGone, worthInterrupting, type Alert } from '../src/domain/notify.js';

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

describe('what is worth interrupting someone for', () => {
  /*
   * The bug this pins actually shipped: the first live push this feature sent
   * was a ₪7 fall on a ₪2,500 stay. Rebookings were gated at ₪20 and plain
   * drops were not gated at all.
   */
  it('does not buzz for a rounding error on a large stay', () => {
    assert.equal(worthInterrupting(drop({ from: 2500, to: 2493 })), false);
  });

  it('buzzes for a real fall', () => {
    assert.equal(worthInterrupting(drop({ from: 4248, to: 3566 })), true);
  });

  it('scales the floor, because a flat one is wrong at both ends', () => {
    // ₪30 off a ₪500 flight is worth knowing…
    assert.equal(worthInterrupting(drop({ from: 530, to: 500 })), true);
    // …and ₪30 off a ₪12,000 fortnight is not.
    assert.equal(worthInterrupting(drop({ from: 12_030, to: 12_000 })), false);
  });

  it('never suppresses a target or a rebooking', () => {
    // A target is a number the reader chose; reaching it is the event whatever
    // its size. A rebooking has its own minimum and a deadline attached.
    assert.equal(worthInterrupting(drop({ kind: 'target', from: 2000, to: 1999, target: 2000 })), true);
    assert.equal(worthInterrupting(drop({ kind: 'rebook', from: 2030, to: 2000 })), true);
  });

  it('sends nothing at all when every drop is noise', () => {
    // composeMessage receives an empty list once the filter has run.
    assert.equal(composeMessage([drop({ from: 2500, to: 2497 })].filter(worthInterrupting)), null);
  });
});
