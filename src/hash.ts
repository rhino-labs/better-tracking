/**
 * PII normalization + SHA-256 (SubtleCrypto) shared by client identify() and
 * the server relay. Vendors only match canonically-normalized hashes.
 */

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Best-effort E.164: strip everything but digits, keep a leading +. */
export const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return digits === '' ? '' : '+' + digits;
};

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const hashEmail = (email: string): Promise<string> => sha256Hex(normalizeEmail(email));
export const hashPhone = (phone: string): Promise<string> => sha256Hex(normalizePhone(phone));
