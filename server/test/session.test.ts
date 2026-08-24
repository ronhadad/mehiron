import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { issueSession, passwordMatches, sessionIsValid } from '../src/domain/session.js';

const SECRET = 'a-long-enough-secret-for-testing-purposes';

describe('session cookies', () => {
  it('accepts a cookie it just issued', async () => {
    assert.equal(await sessionIsValid(await issueSession(SECRET), SECRET), true);
  });

  it('rejects a cookie signed with a different secret', async () => {
    // The whole point of signing: another deployment's cookie must not open this
    // one, and neither must one a visitor made up.
    const theirs = await issueSession('some-other-deployments-secret');
    assert.equal(await sessionIsValid(theirs, SECRET), false);
  });

  it('rejects an expired cookie even when the signature is genuine', async () => {
    const hour = 60 * 60 * 1000;
    const issued = await issueSession(SECRET, Date.now() - 40 * 24 * hour);
    assert.equal(await sessionIsValid(issued, SECRET), false);
  });

  it('rejects a tampered expiry, because the expiry is what is signed', async () => {
    const valid = await issueSession(SECRET);
    const signature = valid.slice(valid.lastIndexOf('.') + 1);
    const farFuture = `${Date.now() + 10 * 365 * 24 * 60 * 60 * 1000}.${signature}`;
    assert.equal(await sessionIsValid(farFuture, SECRET), false);
  });

  it('rejects malformed and empty values rather than throwing', async () => {
    for (const bad of [undefined, '', '.', 'nodot', 'abc.def', '.sig', '123.']) {
      assert.equal(await sessionIsValid(bad, SECRET), false, JSON.stringify(bad));
    }
  });
});

describe('the sign-in password', () => {
  it('accepts the configured password and nothing else', async () => {
    assert.equal(await passwordMatches('correct horse', 'correct horse'), true);
    assert.equal(await passwordMatches('correct hors', 'correct horse'), false);
    assert.equal(await passwordMatches('', 'correct horse'), false);
    assert.equal(await passwordMatches('correct horse ', 'correct horse'), false);
  });

  it('does not treat a prefix as a match', async () => {
    // A naive comparison that stops at the first difference would still be
    // wrong here; this guards the case people actually get wrong.
    assert.equal(await passwordMatches('a', 'aaaaaaaa'), false);
    assert.equal(await passwordMatches('aaaaaaaa', 'a'), false);
  });
});
