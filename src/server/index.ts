/**
 * better-tracking/server (PRD §12.4): self-hosted relay turning the client's
 * beacon (or imperative send() calls) into vendor Conversions-API requests.
 * Web-standard APIs only — runs on Node 18+, Workers, Deno, Bun, Vercel Edge.
 */
import { hashEmail, hashPhone } from '../hash';
import type { EventMap, EventParams, VendorId } from '../types';
import {
  ga4Sender,
  linkedinSender,
  metaSender,
  redditSender,
  tiktokSender,
  xSender,
} from './senders';
import type {
  HashedUser,
  RelayOptions,
  RelayPayload,
  SendResult,
  Sender,
  ServerEvent,
  UserTraits,
} from './types';

export type {
  Ga4Config,
  HashedUser,
  LinkedInConfig,
  MetaConfig,
  RedditConfig,
  RelayOptions,
  RelayPayload,
  SendResult,
  Sender,
  ServerEvent,
  TikTokConfig,
  UserTraits,
  XConfig,
} from './types';
export { oauth1Header } from './oauth1';
export { hashEmail, hashPhone, normalizeEmail, normalizePhone, sha256Hex } from '../hash';

const MAX_BODY_BYTES = 64 * 1024;

export interface SendOptions {
  /** Your own id for dedup/idempotency (defaults to a random UUID). */
  event_id?: string;
  /** Raw identity — normalized and SHA-256 hashed before any vendor call. */
  user?: UserTraits;
  /** epoch ms (defaults to now) */
  ts?: number;
  ip?: string;
  ua?: string;
  url?: string;
}

export interface Relay {
  /** Web-standard endpoint: wire to any framework's POST route. */
  handle(req: Request): Promise<Response>;
  /** Imperative server-originated events (refunds, offline conversions). */
  send<K extends keyof EventMap>(
    event: K,
    params: EventMap[K],
    opts?: SendOptions,
  ): Promise<SendResult[]>;
  send(event: string, params?: EventParams, opts?: SendOptions): Promise<SendResult[]>;
}

async function hashTraits(traits: UserTraits | undefined): Promise<HashedUser> {
  const user: HashedUser = {};
  if (traits?.email !== undefined && traits.email !== '') user.em = await hashEmail(traits.email);
  if (traits?.phone !== undefined && traits.phone !== '') user.ph = await hashPhone(traits.phone);
  if (traits?.external_id !== undefined) user.external_id = traits.external_id;
  return user;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Structural validation of the public beacon body — this endpoint WILL be probed. */
function parsePayload(raw: unknown): RelayPayload | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw['v'] !== 1) return undefined;
  const type = raw['type'];
  if (type !== 'track' && type !== 'page' && type !== 'identify') return undefined;
  if (typeof raw['event_id'] !== 'string' || raw['event_id'].length > 128) return undefined;
  if (typeof raw['ts'] !== 'number' || !Number.isFinite(raw['ts'])) return undefined;
  if (raw['event'] !== undefined && typeof raw['event'] !== 'string') return undefined;
  if (raw['params'] !== undefined && !isRecord(raw['params'])) return undefined;
  if (raw['traits'] !== undefined && !isRecord(raw['traits'])) return undefined;
  if (!isRecord(raw['signals'] ?? {})) return undefined;
  if (raw['sent'] !== undefined && !Array.isArray(raw['sent'])) return undefined;
  return raw as unknown as RelayPayload;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function createRelay(options: RelayOptions): Relay {
  const fetchImpl = options.fetch ?? fetch;
  const senders: Sender[] = [];
  if (options.meta) senders.push(metaSender(options.meta, fetchImpl));
  if (options.ga4) senders.push(ga4Sender(options.ga4, fetchImpl));
  if (options.tiktok) senders.push(tiktokSender(options.tiktok, fetchImpl));
  if (options.linkedin) senders.push(linkedinSender(options.linkedin, fetchImpl));
  if (options.reddit) senders.push(redditSender(options.reddit, fetchImpl));
  if (options.x) senders.push(xSender(options.x, fetchImpl));

  // one vendor's failure never blocks the others (allSettled semantics)
  const fanOut = async (event: ServerEvent): Promise<SendResult[]> =>
    Promise.all(
      senders.map(async (s): Promise<SendResult> => {
        try {
          const skipped = await s.send(event);
          return skipped === undefined
            ? { vendor: s.id, ok: true }
            : { vendor: s.id, ok: true, skipped };
        } catch (error) {
          try {
            options.onError?.(s.id, error, event);
          } catch {
            /* onError must never break the fan-out */
          }
          return { vendor: s.id, ok: false, error };
        }
      }),
    );

  return {
    async handle(req) {
      if (req.method !== 'POST') return new Response(null, { status: 405 });
      let text: string;
      try {
        text = await req.text();
      } catch {
        return new Response(null, { status: 400 });
      }
      if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
      let payload: RelayPayload | undefined;
      try {
        payload = parsePayload(JSON.parse(text));
      } catch {
        payload = undefined;
      }
      if (payload === undefined) return new Response(null, { status: 400 });

      // stateless relay: identify-only beacons carry no event to fan out
      if (payload.type === 'identify') return new Response(null, { status: 204 });

      const name = payload.type === 'page' ? 'page_view' : (payload.event ?? '');
      if (name === '') return new Response(null, { status: 400 });

      const traits = payload.traits;
      const event: ServerEvent = {
        name,
        params: payload.params ?? (payload.props as EventParams | undefined) ?? {},
        event_id: payload.event_id,
        ts: payload.ts,
        url: str(payload.url),
        referrer: str(payload.referrer),
        signals: Object.fromEntries(
          Object.entries(payload.signals ?? {}).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>,
        sent: (payload.sent ?? []).filter((v): v is VendorId => typeof v === 'string'),
        // hash-at-ingest: raw PII never crosses this point (PRD §12.9)
        user: await hashTraits(traits),
      };
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      const ua = req.headers.get('user-agent');
      if (ip !== undefined && ip !== '') event.ip = ip;
      if (ua !== null) event.ua = ua;

      const results = await fanOut(event);
      return new Response(JSON.stringify({ results: results.map(({ vendor, ok }) => ({ vendor, ok })) }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    },

    async send(event: string, params?: EventParams, opts?: SendOptions) {
      const serverEvent: ServerEvent = {
        name: event,
        params: params ?? {},
        event_id: opts?.event_id ?? crypto.randomUUID(),
        ts: opts?.ts ?? Date.now(),
        url: opts?.url ?? '',
        referrer: '',
        signals: {},
        sent: [],
        user: await hashTraits(opts?.user),
      };
      if (opts?.ip !== undefined) serverEvent.ip = opts.ip;
      if (opts?.ua !== undefined) serverEvent.ua = opts.ua;
      return fanOut(serverEvent);
    },
  };
}
