import { ga4 } from './ga4';
import { linkedin } from './linkedin';
import { meta } from './meta';
import { reddit } from './reddit';
import { tiktok } from './tiktok';
import { x } from './x';
import type { Adapter } from '../types';

export { meta, ga4, tiktok, linkedin, reddit, x };

export const adapters: readonly Adapter[] = [meta, ga4, tiktok, linkedin, reddit, x];
