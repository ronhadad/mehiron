import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { consentUrl, isAllowed, pkceChallenge, randomToken } from '../src/domain/googleAuth.js';

describe('the Google sign-in allowlist', () => {
  const allowed = ['ronhadad@masterpro.education', 'someone@example.com'];

  it('admits an allowed address regardless of case or padding', () => {
    assert.equal(isAllowed('ronhadad@masterpro.education', allowed), true);
    assert.equal(isAllowed('RonHadad@MasterPro.Education', allowed), true);
    assert.equal(isAllowed('  ronhadad@masterpro.education  ', allowed), true);
  });

  it('refuses everyone else', () => {
    /*
     * The point of the whole feature. "Sign in with Google" without this admits
     * anybody with a Google account, which for a private tracker is worse than
     * no login at all because it looks secure.
     */
    for (const stranger of [
      'stranger@gmail.com',
      'ronhadad@gmail.com',
      'ronhadad@masterpro.education.evil.com',
      'evil.com/ronhadad@masterpro.education',
      '',
    ]) {
      assert.equal(isAllowed(stranger, allowed), false, stranger);
    }
  });

  it('admits nobody when the allowlist is empty', () => {
    assert.equal(isAllowed('ronhadad@masterpro.education', []), false);
  });
});

describe('PKCE', () => {
  it('derives a stable challenge from a verifier', async () => {
    const verifier = 'a-fixed-verifier-value-for-testing';
    const first = await pkceChallenge(verifier);
    assert.equal(await pkceChallenge(verifier), first, 'must be deterministic');
    assert.match(first, /^[A-Za-z0-9_-]+$/, 'must be base64url with no padding');
  });

  it('gives different verifiers different challenges', async () => {
    assert.notEqual(await pkceChallenge('one'), await pkceChallenge('two'));
  });

  it('produces tokens that do not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken(16)));
    assert.equal(tokens.size, 200);
  });
});

describe('the consent URL', () => {
  const url = new URL(
    consentUrl({
      clientId: 'client-123.apps.googleusercontent.com',
      redirectUri: 'https://example.com/api/auth/google/callback',
      state: 'state-abc',
      challenge: 'challenge-xyz',
    }),
  );

  it('asks only for identity', () => {
    // Requesting more would be asking for trust the app has no use for.
    assert.equal(url.searchParams.get('scope'), 'openid email');
  });

  it('carries the state and the PKCE challenge', () => {
    assert.equal(url.searchParams.get('state'), 'state-abc');
    assert.equal(url.searchParams.get('code_challenge'), 'challenge-xyz');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  });

  it('goes to Google and asks for a code', () => {
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/api/auth/google/callback');
  });
});
