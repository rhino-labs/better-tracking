import { describe, it } from 'vitest';
import { configure, on, track } from '../src/index';

declare module '../src/types' {
  interface EventMap {
    demo_booked: { plan: 'free' | 'pro' | 'enterprise' };
  }
}

describe('public API types', () => {
  it('known events require correct params', () => {
    track('purchase', { value: 49.99, currency: 'USD' });
    track('purchase', { value: 1, currency: 'USD', transaction_id: 't1' });
    // @ts-expect-error purchase requires currency
    track('purchase', { value: 49.99 });
    // @ts-expect-error purchase requires params
    track('purchase');
    // @ts-expect-error value must be a number
    track('purchase', { value: '49.99', currency: 'USD' });
    // @ts-expect-error unknown param key
    track('sign_up', { methodd: 'email' });
  });

  it('all-optional events allow omitting params', () => {
    track('sign_up');
    track('page_view');
    track('generate_lead');
  });

  it('search requires a query', () => {
    track('search', { query: 'shoes' });
    // @ts-expect-error query is required
    track('search', {});
  });

  it('merged custom events are fully checked', () => {
    track('demo_booked', { plan: 'pro' });
    // @ts-expect-error not a valid plan
    track('demo_booked', { plan: 'platinum' });
  });

  it('unregistered custom events accept generic params', () => {
    track('some_untyped_event', { anything: 'goes', n: 1, b: true });
  });

  it('configure is typed', () => {
    configure({ disable: ['tiktok'], map: { purchase: { x: 'tw-1' } } });
    // @ts-expect-error not a vendor id
    configure({ disable: ['snapchat'] });
    // @ts-expect-error map values are vendor→string
    configure({ map: { purchase: { meta: 42 } } });
  });

  it('on() infers payload types', () => {
    on('detect', (p) => p.vendor satisfies string);
    on('dispatch', (p) => p.type satisfies 'track' | 'page' | 'identify');
    // @ts-expect-error unknown emitter event
    on('nope', () => undefined);
  });
});
