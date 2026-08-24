/**
 * Finish the Google sign-in.
 *
 * Every failure sends the visitor back to `/login` with the same generic
 * marker. Saying *why* — wrong account, not on the allowlist, bad state — would
 * let a stranger probe who is allowed in.
 */
import { NextResponse } from 'next/server';
import { authConfig, issueSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@server/domain/session.js';
import { exchangeCode, googleConfig, STATE_COOKIE, VERIFIER_COOKIE } from '@server/domain/googleAuth.js';
import { callbackUrl } from '@/lib/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function back(request: Request, marker: string): NextResponse {
  const url = new URL('/login', request.url);
  url.searchParams.set('googleError', marker);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(VERIFIER_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET(request: Request): Promise<NextResponse> {
  const config = googleConfig();
  const { secret } = authConfig();
  if (!config || !secret) return back(request, 'unconfigured');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Cookies are read from the header because this handler is reached by a
  // top-level redirect from Google, not by our own client.
  const jar = new Map(
    (request.headers.get('cookie') ?? '')
      .split(';')
      .map((part) => part.trim().split('='))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([k, v]) => [k, decodeURIComponent(v)]),
  );

  const expectedState = jar.get(STATE_COOKIE);
  const verifier = jar.get(VERIFIER_COOKIE);

  // The state check is what stops a third party from having their own code
  // redeemed in this browser's session.
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return back(request, 'failed');
  }

  const result = await exchangeCode({ code, verifier, redirectUri: callbackUrl(request), config });
  if (!result.ok) {
    console.warn(`Google sign-in refused: ${result.reason}`);
    return back(request, 'refused');
  }

  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(SESSION_COOKIE, await issueSession(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  response.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(VERIFIER_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
