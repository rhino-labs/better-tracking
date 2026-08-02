/**
 * Internal: the six default adapters registered by the zero-config entries
 * (auto, bt.js). Not exposed in package exports — importing this array pulls
 * in all six adapters, which would defeat tree-shaking of the public barrel.
 */
import { ga4 } from './ga4';
import { linkedin } from './linkedin';
import { meta } from './meta';
import { reddit } from './reddit';
import { tiktok } from './tiktok';
import { x } from './x';
import type { Adapter } from '../types';

export const adapters: readonly Adapter[] = [meta, ga4, tiktok, linkedin, reddit, x];
