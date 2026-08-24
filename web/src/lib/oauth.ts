/**
 * The address Google redirects back to.
 *
 * This must be *byte-identical* to an entry in the OAuth client's authorised
 * redirect list, on both legs of the flow — the consent redirect and the token
 * exchange — or Google answers `redirect_uri_mismatch` and refuses before the
 * user is even asked to approve anything.
 *
 * Deriving it from the request looks tidy and works on localhost, but it makes
 * the URI depend on which hostname the app happened to be opened on. A Vercel
 * project answers on several: the stable alias, a unique URL per deployment, and
 * one per preview branch. Only the alias is ever registered, so sign-in breaks
 * on all the others — and it breaks with an error that points at Google rather
 * than at the host you typed.
 *
 * So a configured base URL wins when there is one, and the request is only the
 * fallback that keeps localhost working with no configuration at all.
 */
export function callbackUrl(request: Request): string {
  const configured = process.env['APP_BASE_URL']?.trim();
  if (configured) {
    // Tolerate a trailing slash in the variable; two slashes in the path would
    // be a different URI to Google and would fail exactly the same way.
    return `${configured.replace(/\/+$/, '')}/api/auth/google/callback`;
  }

  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  return `${proto}://${host}/api/auth/google/callback`;
}
