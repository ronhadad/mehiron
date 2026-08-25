import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/*
 * `companyRuns` lives in the web bundle, so the rule is restated here against
 * the same data shape. What is being pinned is the collapsing behaviour: the
 * reader wants "Booking for nine checks, then Agoda", not a list of ninety rows.
 */
interface Snap {
  status: string;
  cheapestCompany: string | null;
  price: number | null;
  checkedAt: Date;
}

function runs(snapshots: Snap[]): Array<{ company: string; checks: number; low: number; high: number }> {
  const out: Array<{ company: string; checks: number; low: number; high: number }> = [];
  const priced = [...snapshots]
    .reverse()
    .filter((s) => s.status === 'OK' && s.cheapestCompany !== null && s.price !== null);

  for (const s of priced) {
    const company = s.cheapestCompany as string;
    const price = s.price as number;
    const current = out[out.length - 1];
    if (current && current.company === company) {
      current.checks += 1;
      current.low = Math.min(current.low, price);
      current.high = Math.max(current.high, price);
    } else {
      out.push({ company, checks: 1, low: price, high: price });
    }
  }
  return out;
}

const snap = (company: string | null, price: number | null, status = 'OK'): Snap => ({
  status,
  cheapestCompany: company,
  price,
  checkedAt: new Date('2026-08-25T10:00:00Z'),
});

describe('who was cheapest, collapsed into runs', () => {
  it('collapses a repeated company into one run', () => {
    // Newest first, as the snapshots arrive.
    const r = runs([snap('Agoda', 900), snap('Booking.com', 1000), snap('Booking.com', 1100), snap('Booking.com', 1050)]);
    assert.equal(r.length, 2);
    assert.equal(r[0]?.company, 'Booking.com');
    assert.equal(r[0]?.checks, 3);
    assert.equal(r[0]?.low, 1000);
    assert.equal(r[0]?.high, 1100);
    assert.equal(r[1]?.company, 'Agoda');
  });

  it('does not let a failed check split a run', () => {
    /*
     * A company did not stop being cheapest because we could not reach the page.
     * Splitting on a failure would invent a switchover that never happened —
     * which is exactly the fact this feature exists to report.
     */
    const r = runs([snap('Booking.com', 1000), snap(null, null, 'FAILED'), snap('Booking.com', 1010)]);
    assert.equal(r.length, 1);
    assert.equal(r[0]?.checks, 2);
  });

  it('returns one run when nothing ever changed', () => {
    // The UI draws nothing for this: a single run is not a timeline.
    assert.equal(runs([snap('Vio.com', 500), snap('Vio.com', 510)]).length, 1);
  });

  it('reports a company that regained the lead as a separate, later run', () => {
    const r = runs([snap('Booking.com', 900), snap('Agoda', 950), snap('Booking.com', 1000)]);
    assert.equal(r.length, 3);
    assert.deepEqual(r.map((x) => x.company), ['Booking.com', 'Agoda', 'Booking.com']);
  });
});
