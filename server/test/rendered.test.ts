import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLoadingShell, readRendered, retryBudget } from '../src/google/rendered.js';

const SHELL = '<div>התוצאות נטענות</div>';
const RENDERED = '<li>2,396 ₪ Bluebird</li>';

describe('recognising a loading shell', () => {
  it('is a shell when the loading label is there and nothing parsed', () => {
    assert.equal(isLoadingShell(SHELL, 0), true);
  });

  it('is not a shell once something parsed, label or no label', () => {
    // The label survives in the markup of some fully-rendered pages, so results
    // beat it. Otherwise a good check would be thrown away and retried.
    assert.equal(isLoadingShell(SHELL, 3), false);
  });

  it('is not a shell when a search genuinely has no results', () => {
    // No label, nothing parsed: that is a real empty, and retrying it would
    // spend requests waiting for something that is never coming.
    assert.equal(isLoadingShell('<div>לא נמצאו טיסות</div>', 0), false);
  });
});

describe('retrying only while the page is a shell', () => {
  it('returns on the first rendered page without further requests', async () => {
    let calls = 0;
    const r = await readRendered(
      async () => { calls += 1; return RENDERED; },
      () => [1, 2],
      retryBudget(),
    );
    assert.equal(calls, 1);
    assert.equal(r.attempts, 1);
    assert.equal(r.shell, false);
    assert.deepEqual(r.items, [1, 2]);
  });

  it('retries a shell and reports the page that finally rendered', async () => {
    let calls = 0;
    const r = await readRendered(
      async () => { calls += 1; return calls < 2 ? SHELL : RENDERED; },
      (html) => (html === RENDERED ? [7] : []),
      retryBudget(),
      3,
    );
    assert.equal(r.attempts, 2);
    assert.equal(r.shell, false);
    assert.deepEqual(r.items, [7]);
  });

  it('gives up after the attempt cap and says it was still a shell', async () => {
    let calls = 0;
    const r = await readRendered(async () => { calls += 1; return SHELL; }, () => [], retryBudget(), 2);
    assert.equal(calls, 2);
    assert.equal(r.shell, true);
  });

  it('does not retry a genuinely empty result', async () => {
    // The expensive mistake: turning every no-results search into three page
    // loads. An empty page with no loading label is final.
    let calls = 0;
    const r = await readRendered(async () => { calls += 1; return '<div>לא נמצאו טיסות</div>'; }, () => [], retryBudget(), 3);
    assert.equal(calls, 1);
    assert.equal(r.shell, false);
  });
});

describe('the shared retry budget', () => {
  it('stops retrying once the budget is spent, however many pages ask', async () => {
    // Two hotels, each allowed two attempts, but only two extra loads between
    // them: the first spends the budget, the second gets one attempt only.
    const budget = retryBudget(1);
    let first = 0;
    let second = 0;
    await readRendered(async () => { first += 1; return SHELL; }, () => [], budget, 3);
    await readRendered(async () => { second += 1; return SHELL; }, () => [], budget, 3);
    assert.equal(first, 2, 'first page used the one extra load');
    assert.equal(second, 1, 'second page had no budget left to retry');
  });

  it('is not spent by pages that render first time', async () => {
    const budget = retryBudget(2);
    await readRendered(async () => RENDERED, () => [1], budget, 3);
    assert.equal(budget.extraLoads, 2);
  });
});
