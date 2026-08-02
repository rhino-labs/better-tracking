import type { Item } from './types';

/**
 * Item → vendor `contents` shapes, shared by the pixel adapters and the
 * server senders. The two sides of a dedup pair (pixel eventID ↔ CAPI
 * event_id) must send identical contents or vendors match mismatched
 * payloads — keeping one implementation makes drift impossible. Leaf module:
 * each entry tree-shakes just the function it uses.
 */
export const metaContents = (
  items: Item[],
): Array<{ id: string | undefined; quantity: number; item_price: number | undefined }> =>
  items.map((i) => ({ id: i.id, quantity: i.quantity ?? 1, item_price: i.price }));

export const tiktokContents = (
  items: Item[],
): Array<{
  content_id: string | undefined;
  content_name: string | undefined;
  quantity: number;
  price: number | undefined;
}> =>
  items.map((i) => ({
    content_id: i.id,
    content_name: i.name,
    quantity: i.quantity ?? 1,
    price: i.price,
  }));
