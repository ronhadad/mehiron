/**
 * The address Google redirects back to.
 *
 * Derived from the request rather than configured, so it is correct on
 * localhost, on every preview deployment and in production without three
 * separate settings. Vercel terminates TLS upstream, so the forwarded headers
 * are what carry the real scheme and host.
 */
export function callbackUrl(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  return `${proto}://${host}/api/auth/google/callback`;
}
