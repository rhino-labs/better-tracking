import type { VendorId } from './types';

/**
 * Lightweight per-vendor presence checks (a few property lookups each), the
 * single source of truth shared by the adapters and the dev-only
 * missing-adapter warning. Leaf module: importing one adapter pulls only its
 * own detector; only the dev build pulls the whole DETECTORS table.
 */
const g = globalThis as {
  fbq?: { (...args: unknown[]): void; callMethod?: unknown; queue?: unknown };
  gtag?: unknown;
  dataLayer?: unknown;
  ttq?: { track?: unknown };
  lintrk?: unknown;
  rdt?: unknown;
  twq?: unknown;
  pintrk?: unknown;
  snaptr?: unknown;
  uetq?: { push?: unknown };
};

// A valid stub (pre-SDK snippet) counts as detected: calling it queues natively.
export const detectMeta = (): boolean =>
  typeof g.fbq === 'function' && !!(g.fbq.callMethod ?? g.fbq.queue);
export const detectGa4 = (): boolean => typeof g.gtag === 'function' || Array.isArray(g.dataLayer);
export const detectTiktok = (): boolean => typeof g.ttq?.track === 'function';
export const detectLinkedin = (): boolean => typeof g.lintrk === 'function';
export const detectReddit = (): boolean => typeof g.rdt === 'function';
export const detectX = (): boolean => typeof g.twq === 'function';
export const detectPinterest = (): boolean => typeof g.pintrk === 'function';
export const detectSnap = (): boolean => typeof g.snaptr === 'function';
export const detectBing = (): boolean => typeof g.uetq?.push === 'function';

export const DETECTORS: Record<VendorId, () => boolean> = {
  meta: detectMeta,
  ga4: detectGa4,
  tiktok: detectTiktok,
  linkedin: detectLinkedin,
  reddit: detectReddit,
  x: detectX,
  pinterest: detectPinterest,
  snap: detectSnap,
  bing: detectBing,
};
