export type Primitive = string | number | boolean | null | undefined;

export type Item = {
  id?: string;
  name?: string;
  price?: number;
  quantity?: number;
  category?: string;
};

export type ValueParams = {
  value: number;
  /** ISO-4217 code, e.g. "USD" */
  currency: string;
};

/**
 * Canonical event vocabulary (GA4-flavored names). Extend it for your own
 * events via declaration merging:
 *
 *   declare module 'better-tracking' {
 *     interface EventMap { demo_booked: { plan: 'free' | 'pro' } }
 *   }
 */
export interface EventMap {
  page_view: { path?: string; title?: string };
  view_item: { items?: Item[]; value?: number; currency?: string };
  search: { query: string };
  add_to_cart: ValueParams & { items?: Item[] };
  begin_checkout: ValueParams & { items?: Item[] };
  purchase: ValueParams & { items?: Item[]; transaction_id?: string };
  sign_up: { method?: string };
  generate_lead: Partial<ValueParams>;
}

export type KnownEvent = keyof EventMap;
export type CustomParams = Record<string, Primitive | Item[]>;
/** Loose runtime shape adapters receive; canonical params structurally fit it. */
export type EventParams = Record<string, unknown>;
/** Well-known canonical params adapters translate per vendor. */
export type CommonParams = Partial<
  ValueParams & { items: Item[]; query: string; transaction_id: string }
>;

export type VendorId =
  | 'meta'
  | 'ga4'
  | 'tiktok'
  | 'linkedin'
  | 'reddit'
  | 'x'
  // opt-in adapters (better-tracking/adapters/*), not in the auto bundle
  | 'pinterest'
  | 'snap'
  | 'bing';

export type PageProps = { path?: string; title?: string };
export type Traits = { user_id?: string; email?: string; phone?: string };

export interface Adapter {
  readonly id: VendorId;
  detect(): boolean;
  /**
   * `mapped` is the vendor-native event name (or vendor event/conversion id)
   * resolved by the mapper, undefined for unmapped events. `eventId` is the
   * per-event dedup id shared with the server relay (Meta eventID, TikTok
   * event_id, Reddit conversion_id). Return `false` to signal the event was
   * intentionally skipped (e.g. missing required config).
   */
  track(
    event: string,
    params: Readonly<EventParams>,
    mapped: string | undefined,
    eventId: string,
  ): boolean | void;
  page?(props: Readonly<PageProps>): void;
  identify?(traits: Readonly<Traits>): void;
}

/** Options for relayTo() beyond a bare endpoint URL. */
export interface RelayTarget {
  /** Endpoint URL (default '/api/events'). */
  url?: string;
  /** Extra headers — forces the fetch path (sendBeacon can't carry headers). */
  headers?: Record<string, string>;
  /** Last-chance payload rewrite before send. */
  transform?: (payload: RelayPayload) => unknown;
}

/**
 * Snapshot of a queued event handed to the relay transport after the pixel
 * pass (so `sent` reflects what pixels received — the server's dedup input).
 */
export interface RelayEvent {
  kind: 'track' | 'page' | 'identify';
  id: string;
  /** epoch ms */
  ts: number;
  event?: string;
  params?: EventParams;
  props?: PageProps;
  traits?: Traits;
  sent: Partial<Record<VendorId, true>>;
}

/**
 * Transport hook invoked once per event. Build one with relayTo() — keeping
 * the implementation behind this function type is what lets the payload
 * assembly, signals collector, and beacon code tree-shake out of builds that
 * never configure a relay.
 */
export type RelayTransport = (
  event: RelayEvent,
  emit: <K extends 'relay' | 'relay-error'>(name: K, payload: EmitterEvents[K]) => void,
) => void;

/**
 * Versioned envelope POSTed to the relay endpoint (one event per beacon).
 * For `type: 'page'`, `params` carries the page props — the discriminant says
 * how to read them. Optional fields are `| undefined` so the client can build
 * the payload as one literal (JSON.stringify drops undefined values).
 */
export interface RelayPayload {
  v: 1;
  event_id: string;
  type: 'track' | 'page' | 'identify';
  event?: string | undefined;
  params?: EventParams | undefined;
  traits?: Traits | undefined;
  /** epoch ms at track() time */
  ts: number;
  url?: string | undefined;
  referrer?: string | undefined;
  /** vendor cookies + click ids present at init (see collector) */
  signals: Record<string, string>;
  /** vendors the pixel path successfully dispatched to (server dedup policy input) */
  sent: VendorId[];
}

export interface Config {
  /** Log every dispatch and swallow-with-warning instead of silently. */
  debug?: boolean;
  /** Suppress specific vendors even when detected. */
  disable?: VendorId[];
  /** Gate: events queue until this returns true. */
  consent?: () => boolean;
  /**
   * Override/extend event mapping per vendor. For `x` the value is the
   * tw-… event id; for `linkedin` it is the conversion_id.
   */
  map?: Record<string, Partial<Record<VendorId, string>>>;
  /** Auto-fire page_view on history pushState/replaceState/popstate. */
  spa?: boolean;
  /**
   * Forward every event to a first-party server endpoint
   * (better-tracking/server): configure({ relay: relayTo('/api/events') }).
   * The script-tag build also accepts a bare string or `true` ('/api/events').
   */
  relay?: RelayTransport;
}

export interface EmitterEvents {
  detect: { vendor: VendorId };
  dispatch: {
    vendor: VendorId;
    type: 'track' | 'page' | 'identify';
    event: string | undefined;
    params: EventParams | undefined;
    event_id: string;
  };
  relay: { url: string; payload: RelayPayload };
  'relay-error': { url: string; error: unknown };
}
