/**
 * Turning what a person types into what Google Flights needs.
 *
 * Flights are searched by airport code (`TLV`) or by a Knowledge Graph entity
 * (`/m/07yfd0`). Neither is something anyone would type. The bridge is Wikidata:
 * it holds a Freebase identifier (property P646) for most places, and Freebase
 * ids *are* Google's mids — verified by searching Tel Aviv → `/m/06ky_`, the mid
 * Wikidata gives for רודוס, and getting the same five fares and the same
 * cheapest ₪1,360 as the mid captured from a real Google search.
 *
 * So the user types "רודוס" or "Barcelona" in any language, and this resolves it
 * without a hardcoded list of destinations.
 */

const CONTACT = 'mahiron/0.1 (personal vacation price tracker)';

export interface Place {
  /** What to show: the place's own name in the language asked for. */
  label: string;
  /** A one-line disambiguator — "island in Greece". */
  description: string | null;
  /** Google entity id, when the place has one. */
  mid: string | null;
  wikidataId: string;
}

/*
 * Wikidata rate-limits the same way its sister wikis do, and answers with plain
 * text rather than JSON when it does. One request at a time, with a gap.
 */
const GAP_MS = 400;
let chain: Promise<unknown> = Promise.resolve();

function politely<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    return task();
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function wikidata<T>(params: Record<string, string>): Promise<T | null> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({ format: 'json', origin: '*', ...params }).toString();

  try {
    const response = await politely(() =>
      fetch(url, {
        headers: { 'user-agent': CONTACT, accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      }),
    );
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // Rate limiting answers in plain text, so JSON parsing throws. A failed
    // lookup is a place we cannot offer, not an error worth surfacing.
    return null;
  }
}

/** The Freebase/Google id for a Wikidata entity, when it has one. */
async function midOf(wikidataId: string): Promise<string | null> {
  const body = await wikidata<{
    claims?: { P646?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> };
  }>({ action: 'wbgetclaims', entity: wikidataId, property: 'P646' });

  return body?.claims?.P646?.[0]?.mainsnak?.datavalue?.value ?? null;
}

/**
 * Places matching what has been typed, best first.
 *
 * Only the top few are resolved to a mid: each one costs a second request, and
 * nobody reads past the first handful of suggestions.
 */
export async function searchPlaces(query: string, language = 'he', limit = 5): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const body = await wikidata<{
    search?: Array<{ id: string; label?: string; description?: string }>;
  }>({
    action: 'wbsearchentities',
    search: trimmed,
    language,
    uselang: language,
    type: 'item',
    limit: String(Math.min(limit, 10)),
  });

  const hits = body?.search ?? [];
  const resolved: Place[] = [];

  for (const hit of hits.slice(0, limit)) {
    resolved.push({
      label: hit.label ?? trimmed,
      description: hit.description ?? null,
      mid: await midOf(hit.id),
      wikidataId: hit.id,
    });
  }

  // A place with no Google id cannot be flown to, so it is not offered.
  return resolved.filter((place) => place.mid !== null);
}

/** Three uppercase letters is already an airport code and needs no lookup. */
export function isAirportCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim());
}

/**
 * A single best match, for when there is no room to offer a choice.
 *
 * An airport code is passed straight through — someone typing `ATH` means the
 * airport, and looking it up would find the city instead.
 */
export async function resolveDestination(query: string, language = 'he'): Promise<Place | null> {
  const trimmed = query.trim();
  if (isAirportCode(trimmed)) {
    return { label: trimmed.toUpperCase(), description: 'שדה תעופה', mid: trimmed.toUpperCase(), wikidataId: '' };
  }
  return (await searchPlaces(trimmed, language, 1))[0] ?? null;
}
