import { createHash } from 'node:crypto';

/**
 * The version stamped into a break-glass session token.
 *
 * Staff sessions are revoked by bumping `admin_staff.session_version`; the
 * break-glass login has no row, so its "version" is derived from the
 * credential itself. Changing ADMIN_USERNAME or ADMIN_PASSWORD, or bumping the
 * optional ADMIN_SESSION_VERSION, changes it, and every outstanding
 * break-glass token stops verifying on its next request. The password itself
 * is never stored — only 48 bits of its SHA-256 along with the username.
 */
export function breakGlassVersion(
  username: string,
  password: string,
  salt = ''
): number {
  const digest = createHash('sha256')
    .update(`${username}\u0000${password}\u0000${salt}`, 'utf8')
    .digest();
  return digest.readUIntBE(0, 6); // < 2^48, a safe integer and a JSON number
}
