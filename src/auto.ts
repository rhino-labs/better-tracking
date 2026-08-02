/**
 * Zero-config entry: the engine plus all six built-in adapters registered.
 *
 *   import { track } from 'better-tracking/auto';
 *
 * Use the bare 'better-tracking' entry instead to hand-pick adapters (each
 * one is a separate subpath import). This module is listed in package.json
 * `sideEffects` so the registration below survives bundler tree-shaking even
 * on a bare `import 'better-tracking/auto'`.
 */
import { adapters } from './adapters';
import { use } from './index';

export * from './index';

use(...adapters);
