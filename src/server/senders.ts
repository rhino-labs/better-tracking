/**
 * Per-vendor server senders (PRD §12.6). Endpoints/versions are centralized
 * here per vendor so churn is a one-line patch. Each sender returns undefined
 * on success or a skip-reason string when the event intentionally isn't sent.
 */
import { mappedName } from '../mapping';
import type { CommonParams, EventParams } from '../types';
import { deliver } from './http';
import { oauth1Header } from './oauth1';
import type {
  Ga4Config,
  LinkedInConfig,
  MetaConfig,
  RedditConfig,
  Sender,
  TikTokConfig,
  XConfig,
} from './types';

const common = (params: EventParams): CommonParams => params as CommonParams;
const seconds = (ms: number): number => Math.floor(ms / 1000);

// ---------------------------------------------------------------- Meta CAPI
const META_URL = (pixelId: string): string =>
  `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events`;

export function metaSender(cfg: MetaConfig, fetchImpl: typeof fetch): Sender {
  return {
    id: 'meta',
    async send(e) {
      const { value, currency, items } = common(e.params);
      const custom: Record<string, unknown> = { ...e.params };
      delete custom['items'];
      if (items) {
        custom['contents'] = items.map((i) => ({
          id: i.id,
          quantity: i.quantity ?? 1,
          item_price: i.price,
        }));
        custom['content_type'] = 'product';
      }
      const user: Record<string, unknown> = {};
      if (e.user.em !== undefined) user['em'] = [e.user.em];
      if (e.user.ph !== undefined) user['ph'] = [e.user.ph];
      if (e.user.external_id !== undefined) user['external_id'] = [e.user.external_id];
      if (e.signals['_fbp'] !== undefined) user['fbp'] = e.signals['_fbp'];
      if (e.signals['_fbc'] !== undefined) user['fbc'] = e.signals['_fbc'];
      if (e.ip !== undefined) user['client_ip_address'] = e.ip;
      if (e.ua !== undefined) user['client_user_agent'] = e.ua;
      const body: Record<string, unknown> = {
        data: [
          {
            event_name: mappedName('meta', e.name) ?? e.name,
            event_time: seconds(e.ts),
            event_id: e.event_id,
            event_source_url: e.url,
            action_source: 'website',
            user_data: user,
            custom_data: { ...custom, value, currency },
          },
        ],
      };
      if (cfg.testEventCode !== undefined) body['test_event_code'] = cfg.testEventCode;
      await deliver(
        fetchImpl,
        `${META_URL(cfg.pixelId)}?access_token=${encodeURIComponent(cfg.accessToken)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
    },
  };
}

// -------------------------------------------------- GA4 Measurement Protocol
const GA4_URL = 'https://www.google-analytics.com/mp/collect';

export function ga4Sender(cfg: Ga4Config, fetchImpl: typeof fetch): Sender {
  return {
    id: 'ga4',
    async send(e) {
      // GA4 has no dedup mechanism: default is fallback-only — skip anything
      // the client-side gtag already delivered (PRD §12.7)
      if ((cfg.mode ?? 'fallback') === 'fallback' && e.sent.includes('ga4')) {
        return 'ga4 pixel already delivered (fallback mode)';
      }
      // _ga cookie: "GA1.1.123456789.1700000000" → client_id "123456789.1700000000"
      const ga = e.signals['_ga'];
      const clientId = ga?.split('.').slice(-2).join('.');
      if (clientId === undefined || clientId === '') {
        return 'no _ga client_id (required by Measurement Protocol)';
      }
      const body: Record<string, unknown> = {
        client_id: clientId,
        timestamp_micros: e.ts * 1000,
        events: [{ name: mappedName('ga4', e.name) ?? e.name, params: { ...e.params } }],
      };
      if (e.user.external_id !== undefined) body['user_id'] = e.user.external_id;
      const url = `${GA4_URL}?measurement_id=${encodeURIComponent(cfg.measurementId)}&api_secret=${encodeURIComponent(cfg.apiSecret)}`;
      await deliver(fetchImpl, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  };
}

// ------------------------------------------------------- TikTok Events API v2
const TIKTOK_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

export function tiktokSender(cfg: TikTokConfig, fetchImpl: typeof fetch): Sender {
  return {
    id: 'tiktok',
    async send(e) {
      const { value, currency, items, query } = common(e.params);
      const properties: Record<string, unknown> = { ...e.params };
      delete properties['items'];
      delete properties['query'];
      if (value !== undefined) properties['value'] = value;
      if (currency !== undefined) properties['currency'] = currency;
      if (query !== undefined) properties['query'] = query;
      if (items) {
        properties['contents'] = items.map((i) => ({
          content_id: i.id,
          content_name: i.name,
          quantity: i.quantity ?? 1,
          price: i.price,
        }));
      }
      const user: Record<string, unknown> = {};
      if (e.user.em !== undefined) user['email'] = e.user.em;
      if (e.user.ph !== undefined) user['phone'] = e.user.ph;
      if (e.user.external_id !== undefined) user['external_id'] = e.user.external_id;
      if (e.signals['ttclid'] !== undefined) user['ttclid'] = e.signals['ttclid'];
      if (e.signals['_ttp'] !== undefined) user['ttp'] = e.signals['_ttp'];
      if (e.ip !== undefined) user['ip'] = e.ip;
      if (e.ua !== undefined) user['user_agent'] = e.ua;
      const body: Record<string, unknown> = {
        event_source: 'web',
        event_source_id: cfg.pixelCode,
        data: [
          {
            event: mappedName('tiktok', e.name) ?? e.name,
            event_time: seconds(e.ts),
            event_id: e.event_id,
            user,
            page: { url: e.url, referrer: e.referrer },
            properties,
          },
        ],
      };
      if (cfg.testEventCode !== undefined) body['test_event_code'] = cfg.testEventCode;
      await deliver(fetchImpl, TIKTOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Access-Token': cfg.accessToken },
        body: JSON.stringify(body),
      });
    },
  };
}

// ---------------------------------------------------- LinkedIn Conversions API
const LINKEDIN_URL = 'https://api.linkedin.com/rest/conversionEvents';
const LINKEDIN_VERSION = '202411';

export function linkedinSender(cfg: LinkedInConfig, fetchImpl: typeof fetch): Sender {
  return {
    id: 'linkedin',
    async send(e) {
      const rule = Object.prototype.hasOwnProperty.call(cfg.conversionMap, e.name)
        ? cfg.conversionMap[e.name]
        : undefined;
      if (rule === undefined) return `no conversionMap entry for '${e.name}'`;
      const { value, currency } = common(e.params);
      const liFatId = e.signals['li_fat_id'];
      const user: Record<string, unknown> = {};
      const userIds: Array<Record<string, string>> = [];
      if (e.user.em !== undefined) userIds.push({ idType: 'SHA256_EMAIL', idValue: e.user.em });
      if (liFatId !== undefined)
        userIds.push({ idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID', idValue: liFatId });
      if (userIds.length === 0) return 'no matchable identity (hashed email or li_fat_id)';
      user['userIds'] = userIds;
      const body: Record<string, unknown> = {
        conversion: `urn:lla:llaPartnerConversion:${rule}`,
        conversionHappenedAt: e.ts,
        eventId: e.event_id,
        user,
      };
      if (value !== undefined && currency !== undefined) {
        body['conversionValue'] = { currencyCode: currency, amount: String(value) };
      }
      await deliver(fetchImpl, LINKEDIN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.accessToken}`,
          'linkedin-version': cfg.version ?? LINKEDIN_VERSION,
          'x-restli-protocol-version': '2.0.0',
        },
        body: JSON.stringify(body),
      });
    },
  };
}

// ------------------------------------------------------ Reddit Conversions API
const REDDIT_URL = (pixelId: string): string =>
  `https://ads-api.reddit.com/api/v2.0/conversions/events/${encodeURIComponent(pixelId)}`;

export function redditSender(cfg: RedditConfig, fetchImpl: typeof fetch): Sender {
  return {
    id: 'reddit',
    async send(e) {
      const { value, currency, items } = common(e.params);
      const mapped = mappedName('reddit', e.name);
      const metadata: Record<string, unknown> = { conversion_id: e.event_id };
      if (value !== undefined) metadata['value_decimal'] = value;
      if (currency !== undefined) metadata['currency'] = currency;
      if (items) metadata['item_count'] = items.reduce((n, i) => n + (i.quantity ?? 1), 0);
      const user: Record<string, unknown> = {};
      if (e.user.em !== undefined) user['email'] = e.user.em;
      if (e.user.external_id !== undefined) user['external_id'] = e.user.external_id;
      if (e.ip !== undefined) user['ip_address'] = e.ip;
      if (e.ua !== undefined) user['user_agent'] = e.ua;
      const event: Record<string, unknown> = {
        event_at: new Date(e.ts).toISOString(),
        event_type:
          mapped !== undefined
            ? { tracking_type: mapped }
            : { tracking_type: 'Custom', custom_event_name: e.name },
        event_metadata: metadata,
        user,
      };
      const clickId = e.signals['rdt_cid'];
      if (clickId !== undefined) event['click_id'] = clickId;
      const body: Record<string, unknown> = { events: [event] };
      if (cfg.testMode === true) body['test_mode'] = true;
      await deliver(fetchImpl, REDDIT_URL(cfg.pixelId), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.accessToken}`,
        },
        body: JSON.stringify(body),
      });
    },
  };
}

// ---------------------------------------------------------- X Conversion API
const X_URL = (pixelId: string): string =>
  `https://ads-api.x.com/12/measurement/conversions/${encodeURIComponent(pixelId)}`;

export function xSender(cfg: XConfig, fetchImpl: typeof fetch): Sender {
  return {
    id: 'x',
    async send(e) {
      const twEventId = Object.prototype.hasOwnProperty.call(cfg.eventMap, e.name)
        ? cfg.eventMap[e.name]
        : undefined;
      if (twEventId === undefined) return `no eventMap entry for '${e.name}'`;
      const identifiers: Array<Record<string, string>> = [];
      if (e.signals['twclid'] !== undefined) identifiers.push({ twclid: e.signals['twclid'] });
      if (e.user.em !== undefined) identifiers.push({ hashed_email: e.user.em });
      if (e.user.ph !== undefined) identifiers.push({ hashed_phone_number: e.user.ph });
      if (identifiers.length === 0) return 'no matchable identity (twclid or hashed email/phone)';
      const { value, currency } = common(e.params);
      const conversion: Record<string, unknown> = {
        conversion_time: new Date(e.ts).toISOString(),
        event_id: twEventId,
        identifiers,
        conversion_id: e.event_id,
      };
      if (value !== undefined) conversion['value'] = String(value);
      if (currency !== undefined) conversion['price_currency'] = currency;
      const url = X_URL(cfg.pixelId);
      const auth = await oauth1Header(cfg, 'POST', url);
      await deliver(fetchImpl, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth },
        body: JSON.stringify({ conversions: [conversion] }),
      });
    },
  };
}
