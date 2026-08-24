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
  /** Wikidata's coordinates (P625), for the map pin. */
  latitude: number | null;
  longitude: number | null;
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

/**
 * The Google id and the coordinates for several entities in one request.
 *
 * `wbgetclaims` takes a single entity and a single property, so resolving five
 * suggestions used to cost five requests and drew rate limiting almost
 * immediately. `wbgetentities` accepts up to fifty ids at once and returns every
 * claim, so the whole suggestion list now costs one call.
 */
async function factsFor(ids: readonly string[]): Promise<Map<string, { mid: string | null; latitude: number | null; longitude: number | null }>> {
  const facts = new Map<string, { mid: string | null; latitude: number | null; longitude: number | null }>();
  if (ids.length === 0) return facts;

  interface Snak {
    mainsnak?: { datavalue?: { value?: unknown } };
  }
  const body = await wikidata<{
    entities?: Record<string, { claims?: { P646?: Snak[]; P625?: Snak[] } }>;
  }>({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims' });

  for (const [id, entity] of Object.entries(body?.entities ?? {})) {
    const mid = entity.claims?.P646?.[0]?.mainsnak?.datavalue?.value;
    const point = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value as
      | { latitude?: number; longitude?: number }
      | undefined;

    facts.set(id, {
      mid: typeof mid === 'string' ? mid : null,
      latitude: typeof point?.latitude === 'number' ? point.latitude : null,
      longitude: typeof point?.longitude === 'number' ? point.longitude : null,
    });
  }

  return facts;
}

/** Places matching what has been typed, best first. */
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

  const hits = (body?.search ?? []).slice(0, limit);
  const facts = await factsFor(hits.map((h) => h.id));

  return hits
    .map((hit) => {
      const fact = facts.get(hit.id);
      return {
        label: hit.label ?? trimmed,
        description: hit.description ?? null,
        mid: fact?.mid ?? null,
        wikidataId: hit.id,
        latitude: fact?.latitude ?? null,
        longitude: fact?.longitude ?? null,
      };
    })
    // A place with no Google id cannot be flown to, so it is not offered.
    .filter((place) => place.mid !== null);
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
    return {
      label: trimmed.toUpperCase(),
      description: 'שדה תעופה',
      mid: trimmed.toUpperCase(),
      wikidataId: '',
      latitude: null,
      longitude: null,
    };
  }
  return (await searchPlaces(trimmed, language, 1))[0] ?? null;
}
