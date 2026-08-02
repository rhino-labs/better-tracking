import { captureClickIds, collectSignals } from './signals';
import type { RelayPayload, RelayTarget, RelayTransport, VendorId } from './types';

/**
 * Build the relay transport (PRD §12.3): payload assembly, match-signal
 * collection, and sendBeacon → fetch-keepalive delivery.
 *
 *   configure({ relay: relayTo('/api/events') });   // or relayTo() for the default
 *
 * This lives outside core so bundler users who never call relayTo() ship none
 * of it. The script-tag build includes it (bt('configure', { relay: true })).
 */
export function relayTo(target?: string | RelayTarget): RelayTransport {
  // click ids only exist on the landing URL — capture before any SPA navigation
  captureClickIds();
  const custom = typeof target === 'object' ? target : undefined;
  const url = custom?.url ?? (typeof target === 'string' ? target : '/api/events');

  return (e, emit) => {
    const payload: RelayPayload = {
      v: 1,
      event_id: e.id,
      type: e.kind,
      ts: e.ts,
      url: globalThis.location?.href ?? '',
      referrer: globalThis.document?.referrer ?? '',
      signals: collectSignals(),
      sent: Object.keys(e.sent) as VendorId[],
      event: e.event,
      params: e.params ?? e.props,
      traits: e.traits,
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
    }
  };
}
