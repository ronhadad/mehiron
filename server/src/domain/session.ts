/**
 * A signed session cookie, verifiable from middleware.
 *
 * Deliberately built on Web Crypto rather than `node:crypto`: middleware runs on
 * the Edge runtime, where `node:crypto` is unavailable, and the same code has to
 * work in the route handlers too. Web Crypto exists in both.
 *
 * There is one account — this is a personal tracker — so there is no user table.
 * The secret proves the cookie was issued here; the password is checked once, at
 * sign-in.
 */

const COOKIE = 'mehiron_session';
const DAYS = 30;

function bytes(text: string): Uint8Array<ArrayBuffer> {
  // TypeScript 5.7 types Uint8Array over its backing buffer, and Web Crypto only
  // accepts one backed by a plain ArrayBuffer — the encoder's default does not
  // satisfy that, so it is copied into one.
  const encoded = new TextEncoder().encode(text);
  const buffer = new ArrayBuffer(encoded.byteLength);
  const view = new Uint8Array(buffer);
  view.set(encoded);
  return view;
}

function toBase64Url(data: ArrayBuffer | Uint8Array): string {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toBase64Url(await crypto.subtle.sign('HMAC', key, bytes(message)));
}

/**
 * Compare without leaking how much matched.
 *
 * Both sides are hashed first so the comparison is over fixed-length digests —
 * a plain `===` on the secrets would also reveal their length through timing.
 */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [da, dbg] = await Promise.all([
    crypto.subtle.digest('SHA-256', bytes(a)),
    crypto.subtle.digest('SHA-256', bytes(b)),
  ]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(dbg);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export interface AuthConfig {
  password: string | null;
  secret: string | null;
}

/** Reads configuration without throwing, so callers can explain what is missing. */
export function authConfig(): AuthConfig {
  return {
    password: process.env['APP_PASSWORD']?.trim() || null,
    secret: process.env['AUTH_SECRET']?.trim() || null,
  };
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = DAYS * 24 * 60 * 60;

/** A cookie value that expires, and that only this deployment could have signed. */
export async function issueSession(secret: string, now = Date.now()): Promise<string> {
  const expires = String(now + SESSION_MAX_AGE * 1000);
  return `${expires}.${await hmac(secret, expires)}`;
}

/** True when the cookie was signed by this secret and has not expired. */
export async function sessionIsValid(value: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return false;

  const expires = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^\d+$/.test(expires) || Number(expires) < now) return false;

  return sameSecret(signature, await hmac(secret, expires));
}

/** Whether the password offered at sign-in is the configured one. */
export function passwordMatches(offered: string, configured: string): Promise<boolean> {
  return sameSecret(offered, configured);
}
