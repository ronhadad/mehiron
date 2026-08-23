/**
 * A photograph for a destination, found from its name alone.
 *
 * No upload, no picking from a grid: the app is given "רודוס" and finds the
 * picture itself. Wikivoyage is asked first because its lead images are chosen
 * by travellers — Rhodes returns the village of Lindos. Wikipedia is the
 * fallback, and it is a fallback rather than the primary source because its lead
 * image for an island is often a *satellite* photo, which is accurate and
 * useless on a holiday card.
 *
 * Both are Wikimedia Commons, so the attribution travels with the URL.
 */

export interface DestinationPhoto {
  url: string;
  /** Commons file page, for credit. */
  source: string;
  provider: 'wikivoyage' | 'wikipedia';
  title: string;
}

const CONTACT = 'mahiron/0.1 (personal vacation price tracker)';

/**
 * Wikimedia rate-limits, and it says so in plain text rather than JSON.
 *
 * Looking one destination up can ask several wikis in turn, and firing those
 * back-to-back earns "You are making too many requests to the API" — which,
 * because every lookup is wrapped in a catch, showed up as destinations quietly
 * having no photograph at all. So: one request at a time, with a gap. A single
 * search only ever looks up one destination, and the result is cached, so the
 * gap is never felt.
 */
const WIKI_GAP_MS = 600;
let wikiChain: Promise<unknown> = Promise.resolve();

function politely<T>(task: () => Promise<T>): Promise<T> {
  const run = wikiChain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, WIKI_GAP_MS));
    return task();
  });
  wikiChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * A destination's photograph does not change, so it is looked up once.
 *
 * Keyed by the name as given. Holds negative results too — a place with no
 * usable picture should not be re-asked on every search.
 */
const cache = new Map<string, DestinationPhoto | null>();

/**
 * Images that are accurate and useless on a holiday card.
 *
 * The Hebrew Wikivoyage article for רודוס leads with a locator map of Greece;
 * several islands lead with a satellite view. A card wants somewhere you would
 * want to go, so map-like files are skipped and the next candidate is tried.
 * SVG is excluded wholesale — photographs are never SVG.
 */
const NOT_A_PHOTO = /\.svg$|map|locator|location|flag|coat[_ ]of[_ ]arms|sentinel|satellite|topograph|מפה/i;

function looksLikeAPhotograph(url: string): boolean {
  // Wikimedia appends `?utm_source=…`, which defeats an end-anchored extension
  // test — an Eilat locator SVG slipped through on exactly that.
  const filename = decodeURIComponent((url.split('?')[0] ?? '').split('/').pop() ?? '');
  return !NOT_A_PHOTO.test(filename);
}

async function askWiki(host: string, title: string): Promise<{ url: string; page: string } | null> {
  const url = new URL(`https://${host}/w/api.php`);
  url.search = new URLSearchParams({
    action: 'query',
    prop: 'pageimages',
    piprop: 'original',
    format: 'json',
    redirects: '1',
    titles: title,
  }).toString();

  const response = await politely(() =>
    fetch(url, {
      headers: { 'user-agent': CONTACT, accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    }),
  );
  if (!response.ok) return null;

  const body = (await response.json()) as {
    query?: { pages?: Record<string, { title?: string; original?: { source?: string } }> };
  };
  const page = Object.values(body.query?.pages ?? {})[0];
  const source = page?.original?.source;
  return source ? { url: source, page: page?.title ?? title } : null;
}

/**
 * Candidate article titles for a destination.
 *
 * Hebrew names are passed through unchanged — the Hebrew wikis will resolve them
 * — and a trailing country qualifier is dropped, because "רודוס, יוון" is an
 * article on neither wiki while "רודוס" is.
 */
function candidates(destination: string): Array<{ host: string; title: string; provider: DestinationPhoto['provider'] }> {
  const trimmed = destination.trim();
  const bare = trimmed.split(/[,·|]/)[0]?.trim() ?? trimmed;
  const hebrew = /[֐-׿]/.test(bare);

  const titles = bare === trimmed ? [bare] : [bare, trimmed];
  const hosts: Array<[string, DestinationPhoto['provider']]> = hebrew
    ? [
        ['he.wikivoyage.org', 'wikivoyage'],
        ['he.wikipedia.org', 'wikipedia'],
        ['en.wikivoyage.org', 'wikivoyage'],
      ]
    : [
        ['en.wikivoyage.org', 'wikivoyage'],
        ['en.wikipedia.org', 'wikipedia'],
      ];

  return hosts.flatMap(([host, provider]) => titles.map((title) => ({ host, title, provider })));
}

/**
 * The English name of a Hebrew place, via Wikipedia's own language links.
 *
 * Needed because the Hebrew wikis often lead with a locator map, and once those
 * are rejected there is nothing left to fall back to — אילת, לרנקה and רומא all
 * came back empty. The English articles almost always have a photograph, but
 * only answer to their English title.
 */
async function englishTitle(hebrew: string): Promise<string | null> {
  const url = new URL('https://he.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    prop: 'langlinks',
    lllang: 'en',
    format: 'json',
    redirects: '1',
    titles: hebrew,
  }).toString();

  try {
    const response = await politely(() =>
      fetch(url, {
        headers: { 'user-agent': CONTACT, accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      }),
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      query?: { pages?: Record<string, { langlinks?: Array<{ '*'?: string }> }> };
    };
    return Object.values(body.query?.pages ?? {})[0]?.langlinks?.[0]?.['*'] ?? null;
  } catch {
    return null;
  }
}

/** First photo found, or null. Never throws — a missing picture is not an error. */
export async function destinationPhoto(destination: string): Promise<DestinationPhoto | null> {
  const cached = cache.get(destination);
  if (cached !== undefined) return cached;

  const found = await lookUp(destination);
  cache.set(destination, found);
  return found;
}

async function lookUp(destination: string): Promise<DestinationPhoto | null> {
  const all = [...candidates(destination)];

  // For a Hebrew place, queue the English articles too — they are the ones that
  // reliably carry a photograph rather than a map.
  if (/[֐-׿]/.test(destination)) {
    const english = await englishTitle(destination.split(/[,·|]/)[0]?.trim() ?? destination);
    if (english) {
      all.push(
        { host: 'en.wikivoyage.org', title: english, provider: 'wikivoyage' },
        { host: 'en.wikipedia.org', title: english, provider: 'wikipedia' },
      );
    }
  }

  for (const { host, title, provider } of all) {
    try {
      const hit = await askWiki(host, title);
      if (hit && looksLikeAPhotograph(hit.url)) {
        return {
          url: hit.url,
          source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(hit.url.split('/').pop() ?? '')}`,
          provider,
          title: hit.page,
        };
      }
    } catch {
      // Try the next wiki.
    }
  }
  return null;
}
