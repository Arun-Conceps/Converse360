import { encrypt, decrypt } from '../../common/security/encryption.util';

/**
 * Store credentials (api_key / api_secret / access_token) are encrypted at
 * rest. Rows written before encryption existed hold plaintext, so a
 * ciphertext is tagged with a prefix: anything without it is read as a
 * legacy plaintext value and keeps working until it is next saved.
 * (Shopify tokens and Woo keys contain no `enc:v1:`, so the tag is
 * unambiguous, unlike sniffing for colons.)
 */
const PREFIX = 'enc:v1:';

export function encryptCredential(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value.startsWith(PREFIX)) return value;
  return PREFIX + encrypt(value);
}

export function decryptCredential(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext row
  return decrypt(stored.slice(PREFIX.length));
}

/** Columns safe to return to the browser — never a credential. */
export const INTEGRATION_PUBLIC_SELECT = {
  id: true,
  account_id: true,
  platform: true,
  store_url: true,
  status: true,
  last_sync_at: true,
  sync_error: true,
  created_at: true,
  updated_at: true,
} as const;
