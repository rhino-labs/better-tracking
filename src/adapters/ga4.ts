import { detectGa4 } from '../detectors';
import type { Adapter } from '../types';

const g = globalThis as {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: Array<Record<string, unknown>>;
};

export const ga4: Adapter = {
  id: 'ga4',
  detect: detectGa4,
  track(event, params, mapped) {
    const name = mapped ?? event;
    if (typeof g.gtag === 'function') g.gtag('event', name, params);
    else if (g.dataLayer) g.dataLayer.push({ event: name, ...params });
    else return false;
  },
  page(props) {
    const p: Record<string, unknown> = {};
    if (props.path !== undefined) p['page_path'] = props.path;
    if (props.title !== undefined) p['page_title'] = props.title;
    if (typeof g.gtag === 'function') g.gtag('event', 'page_view', p);
    else g.dataLayer?.push({ event: 'page_view', ...p });
  },
  identify(traits) {
    if (traits.user_id !== undefined && typeof g.gtag === 'function') {
      g.gtag('set', { user_id: traits.user_id });
    }
  },
};
