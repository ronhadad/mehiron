/**
 * Fetching pages from Google.
 *
 * No browser. Both Flights and Hotels render their prices into the initial HTML,
 * so an ordinary HTTP request with a believable User-Agent is enough — which is
 * what makes this app able to run on a server instead of a laptop with a Chrome
 * window open.
 *
 * Two responsibilities beyond `fetch`: be a polite client (one request at a time
 * per host, with a gap between them), and fail in a way the caller can act on.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export interface FetchOptions {
  /** `he-IL,he;q=0.9`. Google localises airline and hotel names to match. */
  language?: string;
  timeoutMs?: number;
  /** Attempts on a retryable failure (429, 5xx, network). */
  attempts?: number;
  signal?: AbortSignal;
}

export class GoogleFetchError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GoogleFetchError';
  }
}

/**
 * Serialise requests and keep a gap between them.
 *
 * Everything now comes from one host, so bursts are far easier to notice from
 * the other side than they were when each hotel hit a different site. The gap
 * costs nothing: a vacation is a dozen requests on a 20-minute cycle.
 */
const MIN_GAP_MS = 900;
let chain: Promise<unknown> = Promise.resolve();
let lastStartedAt = 0;

function queued<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastStartedAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    return task();
  });
  // Keep the chain alive even when a task rejects, or one failure wedges the queue.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A 429 or a 5xx is worth retrying; a 404 is not. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

export interface FetchedPage {
  html: string;
  /** Where we ended up — a redirect away from /travel/ means the search was rejected. */
  url: string;
  status: number;
  durationMs: number;
}

export async function fetchGooglePage(url: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const attempts = Math.max(1, options.attempts ?? 3);
  let lastError: GoogleFetchError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await queued(() => once(url, options));
    } catch (error) {
      const failure =
        error instanceof GoogleFetchError
          ? error
          : new GoogleFetchError(error instanceof Error ? error.message : String(error), null, true);
      lastError = failure;
      if (!failure.retryable || attempt === attempts) break;
      // Back off further each time; Google's rate limiting is short-lived.
      await sleep(attempt * 2_000);
    }
  }

  throw lastError ?? new GoogleFetchError('request failed', null, false);
}

async function once(url: string, options: FetchOptions): Promise<FetchedPage> {
  const startedAt = Date.now();
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': options.language ?? 'he-IL,he;q=0.9,en;q=0.8',
        'cache-control': 'no-cache',
        'upgrade-insecure-requests': '1',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new GoogleFetchError(`could not reach Google: ${message}`, null, true);
  }

  if (!response.ok) {
    throw new GoogleFetchError(
      `Google returned ${response.status}`,
      response.status,
      isRetryableStatus(response.status),
    );
  }

  const html = await response.text();

  // A consent interstitial or a sorry page is a 200 with the wrong body; catching
  // it here stops a parser reporting "no results" for what is actually a block.
  if (/\/sorry\/index|unusual traffic|consent\.google\.com/i.test(html.slice(0, 6_000))) {
    throw new GoogleFetchError('Google served a consent or rate-limit page instead of results', 200, true);
  }

  return { html, url: response.url, status: response.status, durationMs: Date.now() - startedAt };
}
