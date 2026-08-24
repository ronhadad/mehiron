/** Signing in and out. */
import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  authConfig,
  issueSession,
  passwordMatches,
} from '@server/domain/session.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A deliberate pause on every attempt.
 *
 * There is no shared store on serverless to count attempts in, so rate limiting
 * per IP is not available here. A fixed delay is what is left: it costs a person
 * signing in almost nothing and makes guessing at scale expensive. It is a
 * mitigation, not a defence — the real defence is a password worth having.
 */
const ATTEMPT_DELAY_MS = 600;

export async function POST(request: Request): Promise<NextResponse> {
  const { password, secret } = authConfig();
  if (!password || !secret) {
    return NextResponse.json({ message: 'האפליקציה לא מוגדרת — חסרים APP_PASSWORD או AUTH_SECRET' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  await new Promise((resolve) => setTimeout(resolve, ATTEMPT_DELAY_MS));

  if (!body?.password || !(await passwordMatches(body.password, password))) {
    return NextResponse.json({ message: 'סיסמה שגויה' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await issueSession(secret), {
    httpOnly: true,
    sameSite: 'lax',
    // Vercel is always HTTPS; localhost is not, and a Secure cookie would never
    // be stored there.
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
