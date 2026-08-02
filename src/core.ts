import { hasOwn, mappedName } from './mapping';
import { captureClickIds, collectSignals } from './signals';
import type {
  Adapter,
  Config,
  EmitterEvents,
  EventParams,
  PageProps,
  RelayPayload,
  Traits,
  VendorId,
} from './types';

const MAX_QUEUE = 50;
const PROBE_DELAYS = [500, 1500, 3000, 6000, 12000];

interface Entry {
  kind: 'track' | 'page' | 'identify';
  id: string;
  ts: number;
  event?: string;
  params?: EventParams;
  props?: PageProps;
  traits?: Traits;
  sent: Partial<Record<VendorId, true>>;
  relayed?: boolean;
}

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

export interface Tracker {
  track(event: string, params?: EventParams): void;
  page(props?: PageProps): void;
  identify(traits: Traits): void;
  configure(config: Config): void;
  on<K extends keyof EmitterEvents>(name: K, fn: (payload: EmitterEvents[K]) => void): () => void;
  detected(): VendorId[];
  /** Register an opt-in adapter (e.g. better-tracking/adapters/pinterest). */
  use(adapter: Adapter): void;
}

export function createTracker(initial: readonly Adapter[]): Tracker {
  const adapters: Adapter[] = [...initial];
  const cfg: Config = {};
  const found = new Set<VendorId>();
  const log: Entry[] = [];
  const listeners: { [K in keyof EmitterEvents]?: Array<(p: EmitterEvents[K]) => void> } = {};
  let spaPatched = false;
  let consentTimer: ReturnType<typeof setTimeout> | undefined;

  const emit = <K extends keyof EmitterEvents>(name: K, payload: EmitterEvents[K]): void => {
    for (const fn of listeners[name] ?? []) {
      try {
        fn(payload);
      } catch {
        /* listener errors never break tracking */
      }
    }
  };

  const consentOk = (): boolean => {
    try {
      return cfg.consent ? cfg.consent() === true : true;
    } catch {
      return false;
    }
  };

  const deliver = (adapter: Adapter, entry: Entry): void => {
    entry.sent[adapter.id] = true;
    try {
      if (entry.kind === 'track' && entry.event !== undefined) {
        const m = cfg.map;
        const mapped =
          (m && hasOwn(m, entry.event) ? m[entry.event]?.[adapter.id] : undefined) ??
          mappedName(adapter.id, entry.event);
        if (adapter.track(entry.event, entry.params ?? {}, mapped, entry.id) === false) {
          // intentional skip (missing config.map id): leave unsent so a later
          // configure({ map }) can replay it
          delete entry.sent[adapter.id];
          if (cfg.debug) console.info('[bt] skip: needs config.map', adapter.id, entry.event);
          return;
        }
      } else if (entry.kind === 'page') {
        if (!adapter.page) return;
        adapter.page(entry.props ?? {});
      } else {
        if (!adapter.identify || !entry.traits) return;
        adapter.identify(entry.traits);
      }
      if (cfg.debug) console.info('[bt]', adapter.id, entry.event ?? entry.kind);
      emit('dispatch', {
        vendor: adapter.id,
        type: entry.kind,
        event: entry.event,
        params: entry.params,
        event_id: entry.id,
      });
    } catch (e) {
      if (cfg.debug) console.warn('[bt] fail', adapter.id, e);
    }
  };

  const relay = (entry: Entry, signals: Record<string, string>): void => {
    const r = cfg.relay;
    if (r === undefined) return;
    const custom = typeof r === 'object' ? r : undefined;
    const url = typeof r === 'object' ? r.url : r === true ? '/api/events' : r;
    entry.relayed = true;
    const payload: RelayPayload = {
      v: 1,
      event_id: entry.id,
      type: entry.kind,
      ts: entry.ts,
      url: globalThis.location?.href ?? '',
      referrer: globalThis.document?.referrer ?? '',
      signals,
      sent: Object.keys(entry.sent) as VendorId[],
      event: entry.event,
      params: entry.params ?? entry.props,
      traits: entry.traits,
    };
    try {
      const body = JSON.stringify(custom?.transform ? custom.transform(payload) : payload);
      let ok = false;
      // sendBeacon survives unload/bounce but can't carry headers
      if (!custom?.headers && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      }
      if (!ok) {
        fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: { 'content-type': 'application/json', ...custom?.headers },
          body,
        }).catch((error: unknown) => emit('relay-error', { url, error }));
      }
      emit('relay', { url, payload });
    } catch (error) {
      emit('relay-error', { url, error });
      if (cfg.debug) console.warn('[bt] relay fail', error);
    }
  };

  const flush = (): void => {
    if (!consentOk()) {
      // consent may be granted with no further track/configure call (e.g. a
      // CMP banner click); poll while events are pending so they still flush
      if (cfg.consent && log.length > 0 && consentTimer === undefined) {
        consentTimer = setTimeout(() => {
          consentTimer = undefined;
          flush();
        }, 500);
      }
      return;
    }
    // one cookie-jar read per flush, shared by every relayed entry
    let signals: Record<string, string> | undefined;
    for (const entry of log) {
      for (const adapter of adapters) {
        if (found.has(adapter.id) && !cfg.disable?.includes(adapter.id) && !entry.sent[adapter.id]) {
          deliver(adapter, entry);
        }
      }
      // relay after the pixel pass so `sent` reflects what pixels received
      // (the server's dedup policy input, e.g. GA4 fallback-only)
      if (cfg.relay !== undefined && !entry.relayed) relay(entry, (signals ??= collectSignals()));
    }
  };

  const probe = (): void => {
    let changed = false;
    for (const adapter of adapters) {
      if (found.has(adapter.id)) continue;
      try {
        if (adapter.detect()) {
          found.add(adapter.id);
          changed = true;
          emit('detect', { vendor: adapter.id });
        }
      } catch {
        /* a throwing detector means not detected */
      }
    }
    if (changed) flush();
  };

  const push = (entry: Entry): void => {
    log.push(entry);
    if (log.length > MAX_QUEUE) {
      // evict fully-delivered history first so the cap bounds the pending
      // backlog, not total history
      const i = log.findIndex((e) => adapters.every((a) => e.sent[a.id]));
      log.splice(i >= 0 ? i : 0, 1);
    }
    probe();
    flush();
  };

  const api: Tracker = {
    track: (event, params) =>
      push({ kind: 'track', id: newId(), ts: Date.now(), event, params: params ?? {}, sent: {} }),
    page: (props) => push({ kind: 'page', id: newId(), ts: Date.now(), props: props ?? {}, sent: {} }),
    identify: (traits) => push({ kind: 'identify', id: newId(), ts: Date.now(), traits, sent: {} }),
    configure: (config) => {
      Object.assign(cfg, config);
      if (cfg.spa) patchSpa();
      probe();
      flush();
    },
    on: <K extends keyof EmitterEvents>(name: K, fn: (payload: EmitterEvents[K]) => void) => {
      // the mapped-type store loses the K correlation; re-assert it locally
      const list = (listeners[name] ??= []) as Array<(p: EmitterEvents[K]) => void>;
      list.push(fn);
      return () => {
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    detected: () => [...found],
    use: (adapter) => {
      if (adapters.some((a) => a.id === adapter.id)) return;
      adapters.push(adapter);
      probe();
      flush();
    },
  };

  const patchSpa = (): void => {
    if (spaPatched || typeof history === 'undefined') return;
    spaPatched = true;
    const fire = (): void => api.page({ path: location.pathname, title: document.title });
    const wrap = (fn: History['pushState']): History['pushState'] =>
      function (this: History, ...args) {
        fn.apply(this, args);
        fire();
      };
    history.pushState = wrap(history.pushState.bind(history));
    history.replaceState = wrap(history.replaceState.bind(history));
    addEventListener('popstate', fire);
  };

  // click ids only exist on the landing URL — capture before any SPA navigation
  captureClickIds();
  // defer the initial probe one microtask so callers registering on('detect')
  // synchronously after creation still see init-time detections
  if (typeof queueMicrotask === 'function') queueMicrotask(probe);
  else probe();
  if (typeof setTimeout === 'function') {
    for (const d of PROBE_DELAYS) setTimeout(probe, d);
  }

  return api;
}
