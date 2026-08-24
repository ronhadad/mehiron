/**
 * Nothing is reachable without a session.
 *
 * This fails closed. With `APP_PASSWORD` or `AUTH_SECRET` unset, every request is
 * refused rather than allowed — a deployment that is missing its configuration
 * must not be an open one, and that is the mistake worth engineering against
 * here: the app can create, price and delete things, and it spends someone
 * else's rate limit doing it.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, authConfig, sessionIsValid } from '@server/domain/session.js';

/** The sign-in page and its endpoint must stay reachable, or nobody can get in. */
const OPEN = ['/login', '/api/auth'];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const { password, secret } = authConfig();
  const wantsJson = pathname.startsWith('/api/');

  if (!password || !secret) {
    const missing = [!password && 'APP_PASSWORD', !secret && 'AUTH_SECRET'].filter(Boolean).join(', ');
    if (wantsJson) {
      return NextResponse.json({ message: `האפליקציה לא מוגדרת — חסר ${missing}` }, { status: 503 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('setup', missing);
    return NextResponse.redirect(url);
  }

  if (await sessionIsValid(request.cookies.get(SESSION_COOKIE)?.value, secret)) {
    return NextResponse.next();
  }

  if (wantsJson) return NextResponse.json({ message: 'נדרשת התחברות' }, { status: 401 });

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  // Come back to where they were headed once signed in.
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
