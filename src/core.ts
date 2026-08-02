import { hasOwn, mappedName } from './mapping';
import type {
  Adapter,
  Config,
  EmitterEvents,
  EventParams,
  PageProps,
  Traits,
  VendorId,
} from './types';

const MAX_QUEUE = 50;
const PROBE_DELAYS = [500, 1500, 3000, 6000, 12000];

interface Entry {
  kind: 'track' | 'page' | 'identify';
  event?: string;
  params?: EventParams;
  props?: PageProps;
  traits?: Traits;
  sent: Partial<Record<VendorId, true>>;
}

export interface Tracker {
  track(event: string, params?: EventParams): void;
  page(props?: PageProps): void;
  identify(traits: Traits): void;
  configure(config: Config): void;
  on<K extends keyof EmitterEvents>(name: K, fn: (payload: EmitterEvents[K]) => void): () => void;
  detected(): VendorId[];
}

export function createTracker(adapters: readonly Adapter[]): Tracker {
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

  const enabled = (id: VendorId): boolean => !cfg.disable?.includes(id);

  const consentOk = (): boolean => {
    try {
      return cfg.consent ? cfg.consent() === true : true;
    } catch {
      return false;
    }
  };

  const override = (event: string, id: VendorId): string | undefined => {
    const m = cfg.map;
    return m && hasOwn(m, event) ? m[event]?.[id] : undefined;
  };

  const deliver = (adapter: Adapter, entry: Entry): void => {
    entry.sent[adapter.id] = true;
    try {
      if (entry.kind === 'track' && entry.event !== undefined) {
        const mapped = override(entry.event, adapter.id) ?? mappedName(adapter.id, entry.event);
        if (adapter.track(entry.event, entry.params ?? {}, mapped) === false) {
          // intentional skip (missing config.map id): leave unsent so a later
          // configure({ map }) can replay it
          delete entry.sent[adapter.id];
          if (cfg.debug) console.info('[bt] skipped (needs config.map)', adapter.id, entry.event);
          return;
        }
      } else if (entry.kind === 'page') {
        if (!adapter.page) return;
        adapter.page(entry.props ?? {});
      } else {
        if (!adapter.identify || !entry.traits) return;
        adapter.identify(entry.traits);
      }
      if (cfg.debug) console.info('[bt]', entry.kind, adapter.id, entry.event ?? '', entry.params ?? entry.props ?? entry.traits);
      emit('dispatch', {
        vendor: adapter.id,
        type: entry.kind,
        event: entry.event,
        params: entry.params,
      });
    } catch (e) {
      if (cfg.debug) console.warn('[bt] dispatch failed', adapter.id, e);
    }
  };

  const flush = (): void => {
    if (!consentOk()) {
      // consent may be granted with no further track/configure call (e.g. a
      // CMP banner click); poll while events are pending so they still flush
      if (cfg.consent && log.length > 0 && consentTimer === undefined && typeof setTimeout === 'function') {
        consentTimer = setTimeout(() => {
          consentTimer = undefined;
          flush();
        }, 500);
      }
      return;
    }
    for (const entry of log) {
      for (const adapter of adapters) {
        if (found.has(adapter.id) && enabled(adapter.id) && !entry.sent[adapter.id]) {
          deliver(adapter, entry);
        }
      }
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
    track: (event, params) => push({ kind: 'track', event, params: params ?? {}, sent: {} }),
    page: (props) => push({ kind: 'page', props: props ?? {}, sent: {} }),
    identify: (traits) => push({ kind: 'identify', traits, sent: {} }),
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

  // defer the initial probe one microtask so callers registering on('detect')
  // synchronously after creation still see init-time detections
  if (typeof queueMicrotask === 'function') queueMicrotask(probe);
  else probe();
  if (typeof setTimeout === 'function') {
    for (const d of PROBE_DELAYS) setTimeout(probe, d);
  }

  return api;
}
