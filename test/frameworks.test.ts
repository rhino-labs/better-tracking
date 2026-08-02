import { describe, expect, it, vi } from 'vitest';
import { createNextRoute, createPagesApiHandler } from '../src/next';
import { createStartRoute } from '../src/tanstack-start';

const body = JSON.stringify({
  v: 1,
  event_id: 'e1',
  type: 'track',
  event: 'purchase',
  params: { value: 1, currency: 'USD' },
  ts: 1,
  url: '',
  referrer: '',
  signals: {},
  sent: [],
});

const okFetch = (): typeof fetch =>
  vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))) as unknown as typeof fetch;

describe('framework wrappers', () => {
  it('createNextRoute exposes a POST handler backed by the relay', async () => {
    const { POST } = createNextRoute({ meta: { pixelId: '1', accessToken: 't' }, fetch: okFetch() });
    const res = await POST(new Request('http://x/api/events', { method: 'POST', body }));
    expect(res.status).toBe(202);
  });

  it('createStartRoute exposes a { request } handler', async () => {
    const { POST } = createStartRoute({ meta: { pixelId: '1', accessToken: 't' }, fetch: okFetch() });
    const res = await POST({ request: new Request('http://x/api/events', { method: 'POST', body }) });
    expect(res.status).toBe(202);
  });

  it('createPagesApiHandler adapts Node req/res streams', async () => {
    const handler = createPagesApiHandler({ meta: { pixelId: '1', accessToken: 't' }, fetch: okFetch() });

    const listeners: Record<string, (arg?: unknown) => void> = {};
    const req = {
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'application/json', 'user-agent': 'UA/1' },
      on(event: string, cb: (arg?: unknown) => void) {
        listeners[event] = cb;
        return this;
      },
    };
    const setHeader = vi.fn();
    let ended = '';
    let resolveEnd: () => void;
    const done = new Promise<void>((r) => (resolveEnd = r));
    const res = {
      statusCode: 0,
      setHeader,
      end: (b?: string) => {
        ended = b ?? '';
        resolveEnd();
      },
    };

    const p = handler(req as never, res as never);
    listeners['data']?.(new TextEncoder().encode(body));
    listeners['end']?.();
    await p;
    await done;

    expect(res.statusCode).toBe(202);
    expect(ended).toContain('results');
  });
});
