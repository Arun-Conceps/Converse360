import {
  encodeSignedState,
  decodeSignedState,
  type OAuthStatePayload,
} from '../../common/security/oauth-state.util';

/**
 * Signed with SHOPIFY_CLIENT_SECRET (per-provider binding) so a state
 * minted for another provider cannot be replayed here, and bound to the
 * accountId that started the flow.
 */
export interface ShopifyOAuthState extends OAuthStatePayload {
  integrationId: string;
}

function key(): string {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) throw new Error('SHOPIFY_CLIENT_SECRET is not configured');
  return secret;
}

export function encodeShopifyState(payload: ShopifyOAuthState): string {
  return encodeSignedState({ payload, secret: key() });
}

export function decodeShopifyState(state: string): ShopifyOAuthState | null {
  let secret: string;
  try {
    secret = key();
  } catch {
    return null; // fail closed
  }
  const decoded = decodeSignedState<ShopifyOAuthState>({ state, secret });
  if (!decoded || typeof decoded.integrationId !== 'string') return null;
  return decoded;
}
