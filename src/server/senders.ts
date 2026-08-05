/**
 * Per-vendor server senders (PRD §12.6). Endpoints/versions are centralized
 * here per vendor so churn is a one-line patch. Each sender returns undefined
 * on success or a skip-reason string when the event intentionally isn't sent.
 * Delivery policy (fallback vs always) is enforced by the relay's fan-out,
 * not in sender bodies — senders only declare their default `mode`.
 */
import { metaContents, tiktokContents } from '../contents';
import { hasOwn, mappedName } from '../mapping';
import type { CommonParams, EventParams } from '../types';
import { postJson } from './http';
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

/** Drop undefined values so vendor objects can be declared as one literal. */
const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// ---------------------------------------------------------------- Meta CAPI
const META_URL = (pixelId: string): string =>
  `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events`;

export function metaSender(cfg: MetaConfig, fetchImpl: typeof fetch): Sender {
  return {
    id: 'meta',
    async send(e) {
      const { items } = common(e.params);
      const custom: Record<string, unknown> = { ...e.params };
      delete custom['items'];
      if (items) {
        custom['contents'] = metaContents(items);
        custom['content_type'] = 'product';
      }
      await postJson(
        fetchImpl,
        `${META_URL(cfg.pixelId)}?access_token=${encodeURIComponent(cfg.accessToken)}`,
        compact({
          data: [
            {
              event_name: mappedName('meta', e.name) ?? e.name,
              event_time: seconds(e.ts),
              event_id: e.event_id,
              event_source_url: e.url,
              action_source: 'website',
              user_data: compact({
                em: e.user.em && [e.user.em],
                ph: e.user.ph && [e.user.ph],
                external_id: e.user.external_id && [e.user.external_id],
                fbp: e.signals['_fbp'],
                fbc: e.signals['_fbc'],
                client_ip_address: e.ip,
                client_user_agent: e.ua,
              }),
              custom_data: custom,
            },
          ],
          test_event_code: cfg.testEventCode,
        }),
      );
    },
  };
}

// -------------------------------------------------- GA4 Measurement Protocol
const GA4_URL = 'https://www.google-analytics.com/mp/collect';

export function ga4Sender(cfg: Ga4Config, fetchImpl: typeof fetch): Sender {
  return {
    id: 'ga4',
    // GA4 has no dedup mechanism, so it defaults to fallback-only (PRD §12.7);
    // the fan-out enforces the mode
    mode: cfg.mode ?? 'fallback',
    async send(e) {
      // servers often store the derived client_id rather than the cookie —
      // accept it directly as signals.ga_client_id, else derive from _ga:
      // "GA1.1.123456789.1700000000" → client_id "123456789.1700000000"
      const ga = e.signals['_ga'];
      const clientId = e.signals['ga_client_id'] ?? ga?.split('.').slice(-2).join('.');
      if (clientId === undefined || clientId === '') {
        return 'no GA4 client_id (pass signals._ga or signals.ga_client_id — required by Measurement Protocol)';
      }
      const url = `${GA4_URL}?measurement_id=${encodeURIComponent(cfg.measurementId)}&api_secret=${encodeURIComponent(cfg.apiSecret)}`;
      await postJson(
        fetchImpl,
        url,
        compact({
          client_id: clientId,
          timestamp_micros: e.ts * 1000,
          user_id: e.user.external_id,
          events: [{ name: mappedName('ga4', e.name) ?? e.name, params: { ...e.params } }],
        }),
      );
    },
  };
}

// ------------------------------------------------------- TikTok Events API v2
const TIKTOK_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

export function tiktokSender(cfg: TikTokConfig, fetchImpl: typeof fetch): Sender {
  return {
    id: 'tiktok',
    async send(e) {
      const { items } = common(e.params);
      const properties: Record<string, unknown> = { ...e.params };
      delete properties['items'];
      if (items) properties['contents'] = tiktokContents(items);
      await postJson(
        fetchImpl,
        TIKTOK_URL,
        compact({
          event_source: 'web',
          event_source_id: cfg.pixelCode,
          test_event_code: cfg.testEventCode,
          data: [
            {
              event: mappedName('tiktok', e.name) ?? e.name,
              event_time: seconds(e.ts),
              event_id: e.event_id,
              user: compact({
                email: e.user.em,
                phone: e.user.ph,
                external_id: e.user.external_id,
                ttclid: e.signals['ttclid'],
                ttp: e.signals['_ttp'],
                ip: e.ip,
                user_agent: e.ua,
              }),
              page: { url: e.url, referrer: e.referrer },
              properties,
            },
          ],
        }),
        { 'Access-Token': cfg.accessToken },
      );
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
      const rule = hasOwn(cfg.conversionMap, e.name) ? cfg.conversionMap[e.name] : undefined;
      if (rule === undefined) return `no conversionMap entry for '${e.name}'`;
      const { value, currency } = common(e.params);
      const liFatId = e.signals['li_fat_id'];
      const userIds: Array<Record<string, string>> = [];
      if (e.user.em !== undefined) userIds.push({ idType: 'SHA256_EMAIL', idValue: e.user.em });
      if (liFatId !== undefined)
        userIds.push({ idType: 'LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID', idValue: liFatId });
      if (userIds.length === 0) return 'no matchable identity (hashed email or li_fat_id)';
      await postJson(
        fetchImpl,
        LINKEDIN_URL,
        compact({
          conversion: `urn:lla:llaPartnerConversion:${rule}`,
          conversionHappenedAt: e.ts,
          eventId: e.event_id,
          user: { userIds },
          conversionValue:
            value !== undefined && currency !== undefined
              ? { currencyCode: currency, amount: String(value) }
              : undefined,
        }),
        {
          authorization: `Bearer ${cfg.accessToken}`,
          'linkedin-version': cfg.version ?? LINKEDIN_VERSION,
          'x-restli-protocol-version': '2.0.0',
        },
      );
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
      await postJson(
        fetchImpl,
        REDDIT_URL(cfg.pixelId),
        compact({
          test_mode: cfg.testMode === true ? true : undefined,
          events: [
            compact({
              event_at: new Date(e.ts).toISOString(),
              event_type:
                mapped !== undefined
                  ? { tracking_type: mapped }
                  : { tracking_type: 'Custom', custom_event_name: e.name },
              event_metadata: compact({
                conversion_id: e.event_id,
                value_decimal: value,
                currency,
                item_count: items?.reduce((n, i) => n + (i.quantity ?? 1), 0),
              }),
              user: compact({
                email: e.user.em,
                external_id: e.user.external_id,
                ip_address: e.ip,
                user_agent: e.ua,
              }),
              click_id: e.signals['rdt_cid'],
            }),
          ],
        }),
        { authorization: `Bearer ${cfg.accessToken}` },
      );
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
      const twEventId = hasOwn(cfg.eventMap, e.name) ? cfg.eventMap[e.name] : undefined;
      if (twEventId === undefined) return `no eventMap entry for '${e.name}'`;
      const identifiers: Array<Record<string, string>> = [];
      if (e.signals['twclid'] !== undefined) identifiers.push({ twclid: e.signals['twclid'] });
      if (e.user.em !== undefined) identifiers.push({ hashed_email: e.user.em });
      if (e.user.ph !== undefined) identifiers.push({ hashed_phone_number: e.user.ph });
      if (identifiers.length === 0) return 'no matchable identity (twclid or hashed email/phone)';
      const { value, currency } = common(e.params);
      const url = X_URL(cfg.pixelId);
      await postJson(
        fetchImpl,
        url,
        {
          conversions: [
            compact({
              conversion_time: new Date(e.ts).toISOString(),
              event_id: twEventId,
              identifiers,
              conversion_id: e.event_id,
              value: value !== undefined ? String(value) : undefined,
              price_currency: currency,
            }),
          ],
        },
        { authorization: await oauth1Header(cfg, 'POST', url) },
      );
    },
  };
}
