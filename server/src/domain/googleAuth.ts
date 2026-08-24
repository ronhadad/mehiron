/**
 * Signing in with a Google account.
 *
 * The important part is not the OAuth dance, it is the allowlist. "Sign in with
 * Google" on its own means *anybody with a Google account* — which for a private
 * tracker is worse than no login at all, because it looks secure. So a
 * successful Google sign-in is only accepted when the verified email address is
 * one of `ALLOWED_EMAILS`.
 *
 * Hand-rolled rather than pulled from a library: the app already has a signed
 * session cookie built on Web Crypto, and all that is missing is the code
 * exchange. Web Crypto also works in middleware, which a Node-only library
 * would not.
 */

/**
 * The two short-lived cookies the flow needs.
 *
 * They live here rather than in a route file because a Next route module may
 * only export request handlers — exporting a constant from one fails the build
 * with "does not match the required types of a Next.js Route".
 */
export const STATE_COOKIE = 'mehiron_oauth_state';
export const VERIFIER_COOKIE = 'mehiron_oauth_verifier';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Lower-cased addresses permitted to sign in. */
  allowed: string[];
}

/** Reads configuration without throwing, so callers can explain what is absent. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env['GOOGLE_CLIENT_ID']?.trim();
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET']?.trim();
  const allowed = (process.env['ALLOWED_EMAILS'] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!clientId || !clientSecret) return null;
  // Configured without an allowlist is the dangerous case, so it counts as
  // unconfigured rather than as "allow everyone".
  if (allowed.length === 0) return null;

  return { clientId, clientSecret, allowed };
}

function toBase64Url(data: ArrayBuffer | Uint8Array): string {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A random URL-safe string, for the state and the PKCE verifier. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PKCE: the challenge is the SHA-256 of the verifier, so the verifier never travels. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return toBase64Url(await crypto.subtle.digest('SHA-256', buffer));
}

/** Where to send the browser to ask Google who this is. */
export function consentUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('response_type', 'code');
  // Only identity is wanted. Asking for more would be asking for trust the app
  // does not need.
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('state', opts.state);
  url.searchParams.set('code_challenge', opts.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Always show the chooser: this app is shared between accounts often enough
  // that silently reusing the last one is confusing.
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  audience: string;
  issuer: string;
}

/**
 * The claims inside an ID token, without verifying its signature.
 *
 * That is safe *only* because this token came straight back from Google's token
 * endpoint over TLS, which is the one case Google's own documentation says needs
 * no signature check — the channel already proves the sender. A token arriving
 * any other way would have to be verified against Google's JWKS, so this
 * function is deliberately not exported for general use.
 */
function claimsOf(idToken: string): GoogleIdentity | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1] as string;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as {
      email?: string;
      email_verified?: boolean | string;
      aud?: string;
      iss?: string;
    };
    if (!claims.email) return null;

    return {
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      audience: claims.aud ?? '',
      issuer: claims.iss ?? '',
    };
  } catch {
    return null;
  }
}

export type ExchangeResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; reason: string };

/**
 * Trade the authorisation code for an identity, and decide whether it may enter.
 *
 * Every rejection returns the same shape, and the caller shows a single generic
 * message: telling a stranger whether their address is on the allowlist would
 * turn this into a way to enumerate it.
 */
export async function exchangeCode(opts: {
  code: string;
  verifier: string;
  redirectUri: string;
  config: GoogleConfig;
}): Promise<ExchangeResult> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.config.clientId,
      client_secret: opts.config.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: opts.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return { ok: false, reason: `token exchange failed (${response.status})` };

  const body = (await response.json().catch(() => null)) as { id_token?: string } | null;
  if (!body?.id_token) return { ok: false, reason: 'no id_token in the response' };

  const identity = claimsOf(body.id_token);
  if (!identity) return { ok: false, reason: 'could not read the id_token' };

  if (identity.issuer !== 'accounts.google.com' && identity.issuer !== 'https://accounts.google.com') {
    return { ok: false, reason: 'unexpected issuer' };
  }
  // Guards against a token minted for a different application being replayed here.
  if (identity.audience !== opts.config.clientId) return { ok: false, reason: 'audience mismatch' };
  if (!identity.emailVerified) return { ok: false, reason: 'email not verified by Google' };
  if (!isAllowed(identity.email, opts.config.allowed)) return { ok: false, reason: 'not on the allowlist' };

  return { ok: true, identity };
}

/** Whether an address may sign in. Case-insensitive; nothing else is special. */
export function isAllowed(email: string, allowed: readonly string[]): boolean {
  return allowed.includes(email.trim().toLowerCase());
}
