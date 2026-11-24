const SHOPIFY_HOST = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/**
 * Validates and normalises a store URL (origin only). Returns null when
 * unacceptable. https only, no embedded credentials / ports / paths; a
 * Shopify store must be `<shop>.myshopify.com`. Public-address checks
 * happen at fetch time (safeFetch), which also covers DNS.
 */
export function normalizeStoreUrl(
  platform: string,
  raw: unknown,
): string | null {
  if (typeof raw !== 'string') return null;
  let input = raw.trim();
  if (!input || input.length > 255) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (platform === 'shopify') {
    if (!SHOPIFY_HOST.test(host)) return null;
    return `https://${host}`;
  }
  // WooCommerce may live under a sub-path (https://x.com/shop).
  const path = u.pathname.replace(/\/+$/, '');
  return `https://${host}${path}`;
}

export function isShopifyShopDomain(shop: unknown): shop is string {
  return typeof shop === 'string' && SHOPIFY_HOST.test(shop);
}
