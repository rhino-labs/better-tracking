import { vi } from 'vitest';
import type { RelayPayload } from '../src/types';

/** fetch mock resolving 200 — typed as fetch so relay configs take it uncast. */
export const okFetch = (): typeof fetch & ReturnType<typeof vi.fn> =>
  vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))) as typeof fetch &
    ReturnType<typeof vi.fn>;

/** A Meta stub the detector accepts (real snippets carry callMethod/queue). */
export const makeFbq = (): ReturnType<typeof vi.fn> & { callMethod: () => undefined } =>
  Object.assign(vi.fn(), { callMethod: () => undefined });

/** Canonical v1 relay beacon body, overridable per test. */
export const relayPayload = (over?: Partial<RelayPayload>): RelayPayload => ({
  v: 1,
  event_id: 'evt-1',
  type: 'track',
  event: 'purchase',
  params: { value: 49.99, currency: 'USD' },
  ts: 1700000000000,
  url: 'https://shop.example/checkout',
  referrer: 'https://google.com',
  signals: { _fbp: 'fb.1.123', _ga: 'GA1.1.111.222', ttclid: 'ttc-1' },
  sent: ['meta'],
  ...over,
});

/** The relay request the client beacon produces for a given body. */
export const relayRequest = (body: unknown): Request =>
  new Request('http://x/api/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '1.2.3.4, 10.0.0.1',
      'user-agent': 'UA/1.0',
    },
    body: JSON.stringify(body),
  });

/**
 * First vendor call captured by an okFetch mock, with its JSON body parsed.
 * `body` stays JSON.parse's `any` so tests can assert into vendor envelopes
 * without per-site casts.
 */
export const sentRequest = (f: ReturnType<typeof vi.fn>): { url: string; init: RequestInit; body: ReturnType<typeof JSON.parse> } => {
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(init.body as string) };
};
