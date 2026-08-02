/** Relay beacon path (PRD §12.3): payload shape, dedup id parity, sent list. */
import { expect, test } from '@playwright/test';
import { SNIPPETS, buildHtml, getCalls, registerRoutes, serve } from './helpers';

test('relay beacon carries the canonical event, match signals, and the pixel dedup id', async ({
  page,
}) => {
  const beacons: unknown[] = [];
  await page.route('https://site.test/api/events', async (route) => {
    beacons.push(JSON.parse(route.request().postData() ?? 'null'));
    await route.fulfill({ status: 202, body: '{}' });
  });

  await serve(
    page,
    buildHtml({
      before: [SNIPPETS['meta'] ?? ''],
      after: [
        `bt('configure',{relay:true});bt('track','purchase',{value:9.5,currency:'EUR'});`,
      ],
    }),
  );

  await expect.poll(() => beacons.length).toBe(1);
  const payload = beacons[0] as {
    v: number;
    type: string;
    event: string;
    event_id: string;
    params: Record<string, unknown>;
    sent: string[];
    url: string;
  };
  expect(payload).toMatchObject({
    v: 1,
    type: 'track',
    event: 'purchase',
    params: { value: 9.5, currency: 'EUR' },
    url: 'https://site.test/',
  });
  expect(payload.sent).toContain('meta');

  // the pixel's eventID and the relay's event_id must match for CAPI dedup
  const calls = await getCalls(page);
  const metaCall = (calls['meta'] ?? []).find((c) => c[1] === 'Purchase') as unknown[];
  expect((metaCall[3] as { eventID: string }).eventID).toBe(payload.event_id);
});

test('click ids from the landing URL are captured into relay signals', async ({ page }) => {
  const beacons: unknown[] = [];
  await page.route('https://site.test/api/events*', async (route) => {
    beacons.push(JSON.parse(route.request().postData() ?? 'null'));
    await route.fulfill({ status: 202, body: '{}' });
  });
  await registerRoutes(
    page,
    buildHtml({ after: [`bt('configure',{relay:true});bt('track','sign_up');`] }),
    'https://site.test/?fbclid=FB123&gclid=G456',
  );
  await page.goto('https://site.test/?fbclid=FB123&gclid=G456');

  await expect.poll(() => beacons.length).toBe(1);
  const payload = beacons[0] as { signals: Record<string, string> };
  expect(payload.signals).toMatchObject({ fbclid: 'FB123', gclid: 'G456' });
});
