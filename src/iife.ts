/**
 * Script-tag entry (bt.js): zero-config — register all built-in adapters,
 * install the global dispatcher, replay the stub queue.
 */
import { adapters } from './adapters/all';
import { use } from './index';
import { installBt } from './install';

use(...adapters);
installBt();
