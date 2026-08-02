/**
 * Script-tag entry (bt.js): zero-config — register all built-in adapters,
 * install the global dispatcher, replay the stub queue.
 */
import { adapters } from './adapters';
import { use } from './index';
import { installBt } from './install';

for (const adapter of adapters) use(adapter);
installBt();
