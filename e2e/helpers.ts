/**
 * Shared fixtures for the late-load matrix (PRD §7.10): pages embed the REAL
 * vendor paste-in snippets; the vendor SDK URLs are network-stubbed with tiny
 * recorders that behave like the real SDKs (drain the stub queue, take over
 * subsequent calls) and log every native call into window.__calls.<vendor>.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const BT_JS = readFileSync(fileURLToPath(new URL('../dist/bt.js', import.meta.url)), 'utf8');

/** Real vendor paste-in snippets (SDK URLs get intercepted). */
export const SNIPPETS: Record<string, string> = {
  meta: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','111111');`,
  ga4: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-TEST');var gs=document.createElement('script');gs.async=true;gs.src='https://www.googletagmanager.com/gtag/js?id=G-TEST';document.head.appendChild(gs);`,
  tiktok: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n=d.createElement("script");n.async=!0;n.src="https://analytics.tiktok.com/i18n/pixel/events.js";document.head.appendChild(n)};ttq.load("TESTID");ttq.page();}(window,document,'ttq');`,
  reddit: `!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js";t.async=!0;document.head.appendChild(t)}}(window,document);rdt('init','t2_test');`,
  x: `!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',t.head.appendChild(u))}(window,document,'script');twq('config','otest1');`,
  linkedin: `window._linkedin_partner_id="123";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push("123");(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var b=document.createElement("script");b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";document.head.appendChild(b)})(window.lintrk);`,
};

/** Recorder "SDKs" served in place of each vendor's real SDK response. */
const SDK_STUBS: Record<string, string> = {
  'connect.facebook.net': `(function(){var r=(window.__calls=window.__calls||{});r.meta=r.meta||[];var n=window.fbq;if(!n)return;n.callMethod=function(){r.meta.push([].slice.call(arguments))};(n.queue||[]).forEach(function(a){n.callMethod.apply(n,a)});n.queue=[];})();`,
  'www.googletagmanager.com': `(function(){var r=(window.__calls=window.__calls||{});r.ga4=r.ga4||[];var dl=window.dataLayer=window.dataLayer||[];function log(a){r.ga4.push(a&&typeof a.length==='number'?[].slice.call(a):a)}dl.forEach(log);var push=dl.push.bind(dl);dl.push=function(a){log(a);return push(a)};})();`,
  'analytics.tiktok.com': `(function(){var r=(window.__calls=window.__calls||{});r.tiktok=r.tiktok||[];var t=window.ttq;if(!t)return;([].slice.call(t)).forEach(function(a){r.tiktok.push(a)});t.track=function(){r.tiktok.push(['track'].concat([].slice.call(arguments)))};t.page=function(){r.tiktok.push(['page'])};t.identify=function(){r.tiktok.push(['identify'].concat([].slice.call(arguments)))};})();`,
  'www.redditstatic.com': `(function(){var r=(window.__calls=window.__calls||{});r.reddit=r.reddit||[];var p=window.rdt;if(!p)return;p.sendEvent=function(){r.reddit.push([].slice.call(arguments))};(p.callQueue||[]).forEach(function(a){p.sendEvent.apply(p,a)});p.callQueue=[];})();`,
  'static.ads-twitter.com': `(function(){var r=(window.__calls=window.__calls||{});r.x=r.x||[];var s=window.twq;if(!s)return;s.exe=function(){r.x.push([].slice.call(arguments))};(s.queue||[]).forEach(function(a){s.exe.apply(s,a)});s.queue=[];})();`,
  'snap.licdn.com': `(function(){var r=(window.__calls=window.__calls||{});r.linkedin=r.linkedin||[];var q=(window.lintrk&&window.lintrk.q)||[];window.lintrk=function(){r.linkedin.push([].slice.call(arguments))};q.forEach(function(a){window.lintrk.apply(null,a)});})();`,
};

export const BT_STUB = `window.bt=window.bt||function(){(bt.q=bt.q||[]).push(arguments)};`;

export interface PageOptions {
  /** inline scripts placed before the bt.js script tag */
  before?: string[];
  /** inline scripts placed after the bt.js script tag */
  after?: string[];
  /** omit the bt.js script tag entirely */
  noBt?: boolean;
}

export function buildHtml(opts: PageOptions): string {
  const script = (src: string): string => `<script>${src}</script>`;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    ...(opts.before ?? []).map(script),
    opts.noBt ? '' : '<script src="/bt.js"></script>',
    ...(opts.after ?? []).map(script),
    '</head><body>ok</body></html>',
  ].join('\n');
}

export async function serve(page: Page, html: string): Promise<void> {
  for (const [host, stub] of Object.entries(SDK_STUBS)) {
    await page.route(`https://${host}/**`, (route) =>
      route.fulfill({ contentType: 'application/javascript', body: stub }),
    );
  }
  await page.route('https://site.test/bt.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: BT_JS }),
  );
  await page.route('https://site.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto('https://site.test/');
}

export type Calls = Record<string, unknown[][]>;

export const getCalls = (page: Page): Promise<Calls> =>
  page.evaluate(() => (window as unknown as { __calls?: Calls }).__calls ?? {});

/** Inject a vendor snippet post-load, exactly like GTM/consent managers do. */
export const injectSnippet = (page: Page, vendor: string): Promise<void> =>
  page.evaluate((src) => {
    const s = document.createElement('script');
    s.textContent = src;
    document.head.appendChild(s);
  }, SNIPPETS[vendor] ?? '');
