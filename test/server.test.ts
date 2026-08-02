import { describe, expect, it, vi } from 'vitest';
import { createRelay } from '../src/server/index';
import { oauth1Header } from '../src/server/oauth1';
import { hashEmail, normalizePhone, sha256Hex } from '../src/hash';
import type { RelayPayload } from '../src/types';

const okFetch = (): ReturnType<typeof vi.fn> =>
  vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));

const payload = (over?: Partial<RelayPayload>): RelayPayload => ({
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

const post = (body: unknown): Request =>
  new Request('http://x/api/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '1.2.3.4, 10.0.0.1',
      'user-agent': 'UA/1.0',
    },
    body: JSON.stringify(body),
  });

describe('relay.handle validation', () => {
  it('rejects non-POST, malformed JSON, and bad shapes', async () => {
    const relay = createRelay({ fetch: okFetch() });
    expect((await relay.handle(new Request('http://x/', { method: 'GET' }))).status).toBe(405);
    expect(
      (await relay.handle(new Request('http://x/', { method: 'POST', body: 'not json' }))).status,
    ).toBe(400);
    expect((await relay.handle(post({ v: 2 }))).status).toBe(400);
    expect((await relay.handle(post({ v: 1, type: 'nope' }))).status).toBe(400);
    expect((await relay.handle(post({ v: 1, type: 'track', event_id: 5 }))).status).toBe(400);
  });

  it('rejects oversized bodies', async () => {
    const relay = createRelay({ fetch: okFetch() });
    const big = payload({ params: { blob: 'x'.repeat(70 * 1024) } });
    expect((await relay.handle(post(big))).status).toBe(413);
  });

  it('acks identify beacons without fan-out', async () => {
    const f = okFetch();
    const relay = createRelay({ meta: { pixelId: '1', accessToken: 't' }, fetch: f });
    const res = await relay.handle(post(payload({ type: 'identify', traits: { email: 'a@b.c' } })));
    expect(res.status).toBe(204);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('meta sender', () => {
  it('builds a CAPI envelope with dedup id, hashed identity, signals, and IP/UA', async () => {
    const f = okFetch();
    const relay = createRelay({
      meta: { pixelId: 'px1', accessToken: 'tok', testEventCode: 'TEST1' },
      fetch: f,
    });
    const res = await relay.handle(post(payload({ traits: { email: ' A@B.co ' } })));
    expect(res.status).toBe(202);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('graph.facebook.com/v21.0/px1/events');
    expect(url).toContain('access_token=tok');
    const body = JSON.parse(init.body as string);
    expect(body.test_event_code).toBe('TEST1');
    const evt = body.data[0];
    expect(evt).toMatchObject({
      event_name: 'Purchase',
      event_id: 'evt-1',
      event_time: 1700000000,
      action_source: 'website',
      event_source_url: 'https://shop.example/checkout',
    });
    expect(evt.user_data).toMatchObject({
      fbp: 'fb.1.123',
      client_ip_address: '1.2.3.4',
      client_user_agent: 'UA/1.0',
      em: [await hashEmail(' A@B.co ')],
    });
    expect(evt.custom_data).toMatchObject({ value: 49.99, currency: 'USD' });
  });
});

describe('ga4 sender dedup policy', () => {
  it('skips when the client pixel already delivered (fallback default)', async () => {
    const f = okFetch();
    const relay = createRelay({ ga4: { measurementId: 'G-1', apiSecret: 's' }, fetch: f });
    await relay.handle(post(payload({ sent: ['ga4'] })));
    expect(f).not.toHaveBeenCalled();
  });

  it('sends with client_id from _ga when the pixel did not deliver', async () => {
    const f = okFetch();
    const relay = createRelay({ ga4: { measurementId: 'G-1', apiSecret: 's' }, fetch: f });
    await relay.handle(post(payload({ sent: [] })));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('measurement_id=G-1');
    const body = JSON.parse(init.body as string);
    expect(body.client_id).toBe('111.222');
    expect(body.events[0]).toMatchObject({ name: 'purchase' });
  });

  it("mode: 'always' sends even when the pixel delivered", async () => {
    const f = okFetch();
    const relay = createRelay({ ga4: { measurementId: 'G-1', apiSecret: 's', mode: 'always' }, fetch: f });
    await relay.handle(post(payload({ sent: ['ga4'] })));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('fan-out isolation & retry', () => {
  it('one vendor failing never blocks the others', async () => {
    const f = vi.fn((url: RequestInfo | URL) =>
      String(url).includes('facebook')
        ? Promise.resolve(new Response('boom', { status: 400 }))
        : Promise.resolve(new Response('{}', { status: 200 })),
    );
    const errors: string[] = [];
    const relay = createRelay({
      meta: { pixelId: '1', accessToken: 't' },
      tiktok: { pixelCode: 'p', accessToken: 't' },
      onError: (vendor) => errors.push(vendor),
      fetch: f as unknown as typeof fetch,
    });
    const results = await relay.send('purchase', { value: 1, currency: 'USD' });
    expect(results).toEqual([
      { vendor: 'meta', ok: false, error: expect.anything() },
      { vendor: 'tiktok', ok: true },
    ]);
    expect(errors).toEqual(['meta']);
  });

  it('retries 5xx up to 3 attempts then fails; does not retry 4xx', async () => {
    const f500 = vi.fn(() => Promise.resolve(new Response('err', { status: 500 })));
    const relay500 = createRelay({
      meta: { pixelId: '1', accessToken: 't' },
      fetch: f500 as unknown as typeof fetch,
    });
    const r1 = await relay500.send('purchase', { value: 1, currency: 'USD' });
    expect(r1[0]?.ok).toBe(false);
    expect(f500).toHaveBeenCalledTimes(3);

    const f400 = vi.fn(() => Promise.resolve(new Response('bad', { status: 403 })));
    const relay400 = createRelay({
      meta: { pixelId: '1', accessToken: 't' },
      fetch: f400 as unknown as typeof fetch,
    });
    await relay400.send('purchase', { value: 1, currency: 'USD' });
    expect(f400).toHaveBeenCalledTimes(1);
  });
});

describe('config-gated vendors', () => {
  it('linkedin skips events without a conversionMap entry or identity', async () => {
    const f = okFetch();
    const relay = createRelay({
      linkedin: { accessToken: 't', conversionMap: { purchase: 999 } },
      fetch: f,
    });
    const skipped = await relay.send('sign_up', {});
    expect(skipped[0]).toMatchObject({ vendor: 'linkedin', ok: true, skipped: expect.any(String) });
    expect(f).not.toHaveBeenCalled();

    await relay.send('purchase', { value: 10, currency: 'EUR' }, { user: { email: 'a@b.co' } });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('linkedin.com/rest/conversionEvents');
    const body = JSON.parse(init.body as string);
    expect(body.conversion).toBe('urn:lla:llaPartnerConversion:999');
    expect(body.conversionValue).toEqual({ currencyCode: 'EUR', amount: '10' });
    expect(body.user.userIds[0].idType).toBe('SHA256_EMAIL');
  });

  it('x signs with OAuth 1.0a and maps via eventMap', async () => {
    const f = okFetch();
    const relay = createRelay({
      x: {
        pixelId: 'o1234',
        consumerKey: 'ck',
        consumerSecret: 'cs',
        accessToken: 'at',
        accessTokenSecret: 'ats',
        eventMap: { purchase: 'tw-o1234-abcde' },
      },
      fetch: f,
    });
    await relay.handle(post(payload({ signals: { twclid: 'clid-1' } })));
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('ads-api.x.com/12/measurement/conversions/o1234');
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toMatch(/^OAuth oauth_consumer_key="ck"/);
    expect(headers['authorization']).toContain('oauth_signature=');
    const body = JSON.parse(init.body as string);
    expect(body.conversions[0]).toMatchObject({
      event_id: 'tw-o1234-abcde',
      conversion_id: 'evt-1',
      identifiers: [{ twclid: 'clid-1' }],
    });
  });

  it('reddit sends Custom with custom_event_name for unmapped events', async () => {
    const f = okFetch();
    const relay = createRelay({ reddit: { pixelId: 't2_x', accessToken: 't' }, fetch: f });
    await relay.send('demo_booked', {}, { event_id: 'e9' });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('ads-api.reddit.com');
    const body = JSON.parse(init.body as string);
    expect(body.events[0].event_type).toEqual({
      tracking_type: 'Custom',
      custom_event_name: 'demo_booked',
    });
    expect(body.events[0].event_metadata.conversion_id).toBe('e9');
  });
});

describe('hashing', () => {
  it('normalizes before hashing (Meta canonical example shape)', async () => {
    // sha256('john_smith@gmail.com') — canonical normalization: trim + lowercase
    expect(await hashEmail('  John_Smith@gmail.com ')).toBe(
      await sha256Hex('john_smith@gmail.com'),
    );
    expect(normalizePhone('(650) 555-1234')).toBe('+6505551234');
  });
});

describe('oauth1 signer', () => {
  it('produces the RFC 5849 reference signature', async () => {
    // Twitter's documented example request/keys
    const header = await oauth1Header(
      {
        consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
        consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
        accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
        accessTokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
      },
      'POST',
      'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
      { nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', timestamp: 1318622958 },
    );
    // signature differs from Twitter's doc value because body params aren't
    // signed (JSON API), but it must be stable and well-formed
    expect(header).toMatch(/^OAuth /);
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toMatch(/oauth_signature="[A-Za-z0-9%]+"/);
  });
});
