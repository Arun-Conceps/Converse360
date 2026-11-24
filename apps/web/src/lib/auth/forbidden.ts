/**
 * Turn a failed API response into something a person can act on.
 *
 * The API now enforces roles (admin for keys, invitations, Zapier, ecommerce,
 * WhatsApp connect/config/templates; agent for campaign/CTWA writes). A raw
 * "Forbidden" / "Insufficient role" toast reads like a bug; "Ask a workspace
 * admin" tells the viewer what to do.
 */
export const ASK_ADMIN_MESSAGE =
  'Ask a workspace admin — your role does not allow this action.'

export function friendlyApiError(
  status: number,
  serverMessage: string | undefined | null,
  fallback: string,
): string {
  if (status === 403) return ASK_ADMIN_MESSAGE
  return serverMessage || fallback
}
