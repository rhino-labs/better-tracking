/**
 * Barrel entry ('better-tracking/adapters'): named exports only, no
 * side effects — bundlers tree-shake the adapters you don't import.
 * Unbundled consumers (CDN ESM, dev servers) load all adapters' code but
 * they stay inert; deep imports ('better-tracking/adapters/meta') remain
 * available where every byte counts.
 */
export { bing } from './bing';
export { ga4 } from './ga4';
export { linkedin } from './linkedin';
export { meta } from './meta';
export { pinterest } from './pinterest';
export { reddit } from './reddit';
export { snap } from './snap';
export { tiktok } from './tiktok';
export { x } from './x';
