/**
 * The late-load matrix (PRD §7.10): real vendor snippets, network-stubbed SDK
 * responses, pixels appearing before init / after init / after first track()
 * / GTM-injected. Asserts the correct native calls reach each vendor exactly
 * once.
 */
import { expect, test } from '@playwright/test';
import { BT_STUB, SNIPPETS, buildHtml, getCalls, injectSnippet, serve } from './helpers';

const TRACK = `bt('track','purchase',{value:49.99,currency:'USD'});`;

const purchases = (calls: unknown[][] | undefined, pred: (c: unknown[]) => boolean): unknown[][] =>
  (calls ?? []).filter(pred);

test('pixels before us: one track() reaches every vendor with native names', async ({ page }) => {
  await serve(
    page,
    buildHtml({
      before: [
        SNIPPETS['meta'] ?? '',
        SNIPPETS['ga4'] ?? '',
        SNIPPETS['tiktok'] ?? '',
        SNIPPETS['reddit'] ?? '',
        SNIPPETS['x'] ?? '',
        SNIPPETS['linkedin'] ?? '',
      ],
      after: [
        `bt('configure',{map:{purchase:{x:'tw-otest1-aaaaa',linkedin:'54321'}}});` + TRACK,
      ],
    }),
  );

  await expect
    .poll(async () => Object.keys(await getCalls(page)).sort())
    .toEqual(['ga4', 'linkedin', 'meta', 'reddit', 'tiktok', 'x']);

  const calls = await getCalls(page);
  expect(
    purchases(calls['meta'], (c) => c[0] === 'track' && c[1] === 'Purchase'),
  ).toHaveLength(1);
  const metaCall = purchases(calls['meta'], (c) => c[1] === 'Purchase')[0] as [
    string,
    string,
    Record<string, unknown>,
    Record<string, unknown>,
  ];
  expect(metaCall[2]).toMatchObject({ value: 49.99, currency: 'USD' });
  expect(metaCall[3]?.['eventID']).toEqual(expect.any(String));

  expect(
    purchases(calls['ga4'], (c) => c[0] === 'event' && c[1] === 'purchase'),
  ).toHaveLength(1);
  expect(
    purchases(calls['tiktok'], (c) => c[0] === 'track' && c[1] === 'CompletePayment'),
  ).toHaveLength(1);
  expect(
    purchases(calls['reddit'], (c) => c[0] === 'track' && c[1] === 'Purchase'),
  ).toHaveLength(1);
  expect(purchases(calls['x'], (c) => c[0] === 'event' && c[1] === 'tw-otest1-aaaaa')).toHaveLength(1);
  expect(
    purchases(
      calls['linkedin'],
      (c) => c[0] === 'track' && (c[1] as { conversion_id?: number })?.conversion_id === 54321,
    ),
  ).toHaveLength(1);
});

test('pixel after us: event queued at init flushes on a retry probe', async ({ page }) => {
  await serve(page, buildHtml({ after: [TRACK] }));
  // no pixel yet
  expect((await getCalls(page))['meta']).toBeUndefined();

  await injectSnippet(page, 'meta');
  // retry probes run at 500ms/1.5s… after init
  await expect
    .poll(async () => purchases((await getCalls(page))['meta'], (c) => c[1] === 'Purchase').length, {
      timeout: 5000,
    })
    .toBe(1);
});

test('pixel after first track(): backlog replays to the late vendor once, no duplicates to early ones', async ({
  page,
}) => {
  await serve(page, buildHtml({ before: [SNIPPETS['meta'] ?? ''], after: [TRACK] }));
  await expect
    .poll(async () => purchases((await getCalls(page))['meta'], (c) => c[1] === 'Purchase').length)
    .toBe(1);

  await injectSnippet(page, 'tiktok');
  // second track() re-probes, detects TikTok, replays the backlog to it only
  await page.evaluate(`bt('track','sign_up')`);

  await expect
    .poll(async () => ((await getCalls(page))['tiktok'] ?? []).length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
  const calls = await getCalls(page);
  expect(purchases(calls['tiktok'], (c) => c[1] === 'CompletePayment')).toHaveLength(1);
  expect(purchases(calls['tiktok'], (c) => c[1] === 'CompleteRegistration')).toHaveLength(1);
  // meta got each event exactly once
  expect(purchases(calls['meta'], (c) => c[1] === 'Purchase')).toHaveLength(1);
  expect(purchases(calls['meta'], (c) => c[1] === 'CompleteRegistration')).toHaveLength(1);
});

test('GTM-late injection: pixel appearing seconds after load still receives earlier events', async ({
  page,
}) => {
  await serve(page, buildHtml({ after: [TRACK] }));
  await page.waitForTimeout(1000); // past the first two probe ticks
  await injectSnippet(page, 'reddit'); // what a GTM tag firing late does
  await expect
    .poll(async () => purchases((await getCalls(page))['reddit'], (c) => c[1] === 'Purchase').length, {
      timeout: 8000, // next probe tick is at 3s
    })
    .toBe(1);
});

test('command-queue stub: bt() calls made before bt.js loads are replayed', async ({ page }) => {
  await serve(
    page,
    buildHtml({
      before: [SNIPPETS['meta'] ?? '', BT_STUB + TRACK],
    }),
  );
  await expect
    .poll(async () => purchases((await getCalls(page))['meta'], (c) => c[1] === 'Purchase').length)
    .toBe(1);
});

test('GTM-only GA4 (dataLayer, no gtag): events push GA4-shaped objects into dataLayer', async ({
  page,
}) => {
  await serve(
    page,
    buildHtml({
      before: ['window.dataLayer=window.dataLayer||[];'],
      after: [TRACK],
    }),
  );
  const entry = await page.evaluate(
    () => (window as unknown as { dataLayer: unknown[] }).dataLayer.slice(-1)[0],
  );
  expect(entry).toMatchObject({ event: 'purchase', value: 49.99, currency: 'USD' });
});
