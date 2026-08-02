/**
 * Dependency-free OAuth 1.0a HMAC-SHA1 request signing (RFC 5849) via
 * WebCrypto — the implementation tax of X's Conversion API (PRD §12.9).
 * Body params are not signed (JSON body, not form-encoded).
 */

export interface OAuth1Keys {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

const ENC = new TextEncoder();

// RFC 3986 percent-encoding (stricter than encodeURIComponent)
export const rfc3986 = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

async function hmacSha1(key: string, base: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    ENC.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, ENC.encode(base));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function oauth1Header(
  keys: OAuth1Keys,
  method: string,
  url: string,
  extra?: { nonce?: string; timestamp?: number },
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: extra?.nonce ?? crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(extra?.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_token: keys.accessToken,
    oauth_version: '1.0',
  };

  const u = new URL(url);
  const params: Array<[string, string]> = [...u.searchParams.entries()];
  for (const [k, v] of Object.entries(oauth)) params.push([k, v]);
  const paramString = params
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    // RFC 5849 §3.4.1.3.2 requires byte-order comparison, not locale order
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const baseUrl = u.origin + u.pathname;
  const base = [method.toUpperCase(), rfc3986(baseUrl), rfc3986(paramString)].join('&');
  const signingKey = `${rfc3986(keys.consumerSecret)}&${rfc3986(keys.accessTokenSecret)}`;
  oauth['oauth_signature'] = await hmacSha1(signingKey, base);

  return (
    'OAuth ' +
    Object.entries(oauth)
      .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
      .join(', ')
  );
}
