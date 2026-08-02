/** Delivery primitive shared by all senders: timeout, bounded retry. */

const ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;
const BACKOFF_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class VendorHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`vendor responded ${status}: ${body.slice(0, 500)}`);
  }
}

/**
 * POST with timeout; retry (exponential backoff) on network errors and
 * 429/5xx, never on other 4xx (PRD §12.4.5).
 */
export async function deliver(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
    try {
      const res = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        // release the connection: an unconsumed body pins the socket (undici)
        void res.body?.cancel().catch(() => undefined);
        return;
      }
      const err = new VendorHttpError(res.status, await res.text().catch(() => ''));
      if (res.status !== 429 && res.status < 500) throw err;
      lastError = err;
    } catch (e) {
      if (e instanceof VendorHttpError) throw e;
      lastError = e; // network/timeout: retry
    }
  }
  throw lastError;
}

/** The shape every sender ends with: JSON POST via deliver(). */
export const postJson = (
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<void> =>
  deliver(fetchImpl, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
