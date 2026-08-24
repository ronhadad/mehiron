import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { graceMs, isDue, nextDueAt, type Schedulable } from '../src/domain/schedule.js';

const NOW = new Date('2026-08-24T12:00:00.000Z');

function vacation(over: Partial<Schedulable> = {}): Schedulable {
  return {
    intervalSeconds: 3600,
    paused: false,
    archived: false,
    lastCheckedAt: new Date('2026-08-24T11:00:00.000Z'),
    options: [{ active: true }],
    ...over,
  };
}

describe('is a vacation due', () => {
  it('is due when a full interval has passed', () => {
    assert.equal(isDue(vacation(), NOW), true);
  });

  it('is not due partway through the interval', () => {
    assert.equal(isDue(vacation({ lastCheckedAt: new Date('2026-08-24T11:50:00.000Z') }), NOW), false);
  });

  it('is due when it has never been checked', () => {
    assert.equal(isDue(vacation({ lastCheckedAt: null }), NOW), true);
  });

  it('is never due while paused or archived', () => {
    assert.equal(isDue(vacation({ paused: true, lastCheckedAt: null }), NOW), false);
    assert.equal(isDue(vacation({ archived: true, lastCheckedAt: null }), NOW), false);
  });

  it('is not due when nothing is being watched', () => {
    // A check would spend a Google request to learn nothing about no options.
    assert.equal(isDue(vacation({ options: [], lastCheckedAt: null }), NOW), false);
    assert.equal(isDue(vacation({ options: [{ active: false }], lastCheckedAt: null }), NOW), false);
  });

  it('is not due when the last check is somehow in the future', () => {
    // Clock skew between the app and the database must not cause a check storm.
    assert.equal(isDue(vacation({ lastCheckedAt: new Date('2026-08-24T13:00:00.000Z') }), NOW), false);
  });
});

describe('grace against scheduler drift', () => {
  /*
   * The bug this exists for: an hourly interval checked at 12:00:04 is 59m56s
   * old when an on-the-hour scheduler fires at 13:00, so a strict comparison
   * defers it to 14:00 and the hourly check quietly becomes two-hourly. Every
   * subsequent check drifts further.
   */
  it('lets an hourly check run when the scheduler fires four seconds early', () => {
    const checked = new Date('2026-08-24T11:00:04.000Z');
    assert.equal(isDue(vacation({ lastCheckedAt: checked }), NOW), true);
  });

  it('never allows more than a minute of earliness', () => {
    assert.equal(graceMs(24 * 3600), 60_000);
    assert.equal(graceMs(3600), 60_000);
  });

  it('scales down for short intervals, so a 15-minute check is not a 13-minute one', () => {
    assert.equal(graceMs(900), 60_000); // 10% of 15 minutes is 90s, so the cap bites.
    assert.equal(graceMs(300), 30_000); // 10% of five minutes.
    assert.equal(graceMs(60), 6_000);
  });

  it('does not let grace compound into a shorter effective interval', () => {
    // Checked exactly on time, the next check is one interval later minus the
    // grace — not minus the grace twice.
    const v = vacation({ lastCheckedAt: NOW, intervalSeconds: 900 });
    const next = nextDueAt(v);
    assert.ok(next);
    assert.equal(next.getTime() - NOW.getTime(), 900_000 - graceMs(900));
  });
});

describe('next due time', () => {
  it('is immediate for a vacation never checked', () => {
    assert.equal(nextDueAt(vacation({ lastCheckedAt: null }))?.getTime(), 0);
  });

  it('is null when nothing would ever run it', () => {
    assert.equal(nextDueAt(vacation({ paused: true })), null);
    assert.equal(nextDueAt(vacation({ options: [] })), null);
  });
});
