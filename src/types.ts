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

export type VendorId = 'meta' | 'ga4' | 'tiktok' | 'linkedin' | 'reddit' | 'x';

export type PageProps = { path?: string; title?: string };
export type Traits = { user_id?: string; email?: string; phone?: string };

export interface Adapter {
  readonly id: VendorId;
  detect(): boolean;
  /**
   * `mapped` is the vendor-native event name (or vendor event/conversion id)
   * resolved by the mapper, undefined for unmapped events. Return `false` to
   * signal the event was intentionally skipped (e.g. missing required config).
   */
  track(event: string, params: Readonly<EventParams>, mapped: string | undefined): boolean | void;
  page?(props: Readonly<PageProps>): void;
  identify?(traits: Readonly<Traits>): void;
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
}

export interface EmitterEvents {
  detect: { vendor: VendorId };
  dispatch: {
    vendor: VendorId;
    type: 'track' | 'page' | 'identify';
    event: string | undefined;
    params: EventParams | undefined;
  };
}
