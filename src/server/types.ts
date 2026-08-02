import type { EventParams, RelayPayload, Traits, VendorId } from '../types';

export type { RelayPayload };

/**
 * Raw (unhashed) identity accepted by send(); hashed before any vendor call.
 * Extends the client's Traits shape — `user_id` and `external_id` are the
 * same field (the client says user_id, vendor APIs say external_id).
 */
export interface UserTraits extends Traits {
  external_id?: string;
}

/** Normalized + SHA-256-hashed identity actually put on the wire. */
export interface HashedUser {
  em?: string;
  ph?: string;
  external_id?: string;
}

/** Canonical event after validation/enrichment, input to every sender. */
export interface ServerEvent {
  name: string;
  params: EventParams;
  event_id: string;
  /** epoch ms */
  ts: number;
  url: string;
  referrer: string;
  /** vendor cookies + click ids captured by the client collector */
  signals: Record<string, string>;
  /** vendors the client pixel path already delivered to (dedup policy input) */
  sent: VendorId[];
  user: HashedUser;
  ip?: string;
  ua?: string;
}

export interface MetaConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

export interface Ga4Config {
  measurementId: string;
  apiSecret: string;
  /**
   * GA4 has no server/pixel dedup. 'fallback' (default) sends only events the
   * client pixel did NOT deliver; 'always' sends everything (PRD §12.7).
   */
  mode?: 'fallback' | 'always';
}

export interface TikTokConfig {
  pixelCode: string;
  accessToken: string;
  testEventCode?: string;
}

export interface LinkedInConfig {
  accessToken: string;
  /** canonical event name → LinkedIn conversion rule id */
  conversionMap: Record<string, number>;
  /** LinkedIn-Version header, defaults to a known-good pinned version */
  version?: string;
}

export interface RedditConfig {
  pixelId: string;
  accessToken: string;
  testMode?: boolean;
}

export interface XConfig {
  pixelId: string;
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  /** canonical event name → tw-… event id (mirrors client config.map.x) */
  eventMap: Record<string, string>;
}

export interface RelayOptions {
  meta?: MetaConfig;
  ga4?: Ga4Config;
  tiktok?: TikTokConfig;
  linkedin?: LinkedInConfig;
  reddit?: RedditConfig;
  x?: XConfig;
  /** Called once per vendor failure (after retries are exhausted). */
  onError?: (vendor: VendorId, error: unknown, event: ServerEvent) => void;
  /** Override fetch (testing, custom agents). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export type SendResult =
  | { vendor: VendorId; ok: true; skipped?: string }
  | { vendor: VendorId; ok: false; error: unknown };

export interface Sender {
  readonly id: VendorId;
  /**
   * Delivery policy, enforced by the relay fan-out: 'fallback' sends only
   * events the client pixel did NOT deliver (per the payload's `sent` list);
   * 'always' (default) sends everything. GA4 defaults to 'fallback' because
   * it has no server/pixel dedup (PRD §12.7).
   */
  readonly mode?: 'fallback' | 'always';
  send(event: ServerEvent): Promise<string | void>;
}
