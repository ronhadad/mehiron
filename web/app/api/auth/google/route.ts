/**
 * Start the Google sign-in.
 *
 * The `state` and the PKCE verifier are kept in short-lived HttpOnly cookies
 * rather than in server memory, because there is no memory to share between
 * serverless invocations — the request that starts this and the request that
 * finishes it are different machines.
 */
import { NextResponse } from 'next/server';
import {
  consentUrl,
  googleConfig,
  pkceChallenge,
  randomToken,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from '@server/domain/googleAuth.js';
import { callbackUrl } from '@/lib/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const config = googleConfig();
  if (!config) {
    const back = new URL('/login', request.url);
    back.searchParams.set('googleError', 'unconfigured');
    return NextResponse.redirect(back);
  }

  const state = randomToken(16);
  const verifier = randomToken(32);

  const response = NextResponse.redirect(
    consentUrl({
      clientId: config.clientId,
      redirectUri: callbackUrl(request),
      state,
      challenge: await pkceChallenge(verifier),
    }),
  );

  const shortLived = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    // Long enough to choose an account, short enough not to linger.
    maxAge: 10 * 60,
  };
  response.cookies.set(STATE_COOKIE, state, shortLived);
  response.cookies.set(VERIFIER_COOKIE, verifier, shortLived);
  return response;
}
