import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { adminPassword, adminUsername } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { breakGlassVersion } from '@/lib/session-version';
import {
  BREAK_GLASS_SUBJECT,
  SESSION_COOKIE,
  signSession,
  verifySessionToken,
} from '@/lib/session';
import { decoyHash, verifyPassword } from '@/lib/staff/password';
import { getRole } from '@/lib/staff/role-store';
import { ROLE_CAPABILITIES, type Capability } from '@/lib/staff/roles';

/**
 * The panel's data access layer for auth.
 *
 * proxy.ts bounces anonymous requests, but that check is optimistic — it only
 * proves a signed cookie was present. Every page, every Server Action and
 * every route handler goes through `requireStaff()` / `requireCapability()`,
 * which re-read the staff row, because a Server Action is reachable by direct
 * POST whatever the proxy or the nav did.
 *
 * ## Two kinds of login
 *
 * 1. **Staff** — rows in `admin_staff` (migration 098), each with a role.
 * 2. **Break-glass** — the original `ADMIN_USERNAME`/`ADMIN_PASSWORD` env
 *    credential. It signs in as a Super Admin with no staff row, which is
 *    what lets the very first staff account be created, and what gets an
 *    operator back in if every staff login is lost. It cannot be assigned a
 *    client or a ticket (it is not a person), and the audit log names it as
 *    such. Remove it by unsetting the env pair once staff accounts exist —
 *    the panel then refuses it like any wrong password.
 */

export type Staff = {
  /** `admin_staff.id`; null for the break-glass login. */
  id: string | null;
  email: string;
  name: string;
  /** Role key: one of the six built-ins or a custom role (migration 101). */
  role: string;
  roleLabel: string;
  /** What this role may do. Read through `can()`, never directly. */
  capabilities: ReadonlySet<Capability>;
  isBreakGlass: boolean;
  /** Unix seconds. */
  sessionExpiresAt: number;
  /** The string written to `admin_audit_log.actor` and event `actor`s. */
  actor: string;
};

/**
 * Compares two strings without leaking, through timing, how far the comparison
 * got. Both sides are hashed first so the buffers are always the same length.
 */
function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}

/**
 * What a break-glass token must carry to still be honoured. Derived from the
 * live credential (+ optional ADMIN_SESSION_VERSION), so rotating the env
 * password or bumping that variable revokes every outstanding break-glass
 * session on its next request.
 */
function currentBreakGlassVersion(): number {
  return breakGlassVersion(
    adminUsername().trim().toLowerCase(),
    adminPassword(),
    process.env.ADMIN_SESSION_VERSION?.trim() ?? ''
  );
}

function breakGlassConfigured(): boolean {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
}

export type LoginResult =
  | { ok: true; subject: string; role: string; version: number }
  | { ok: false };

/**
 * Checks a login against staff rows first, then the break-glass credential.
 *
 * Every path runs one scrypt verify, so an unknown email, an inactive account
 * and a wrong password all cost the same — response time must not reveal
 * which staff emails exist.
 */
export async function checkCredentials(
  identifier: string,
  password: string
): Promise<LoginResult> {
  const email = identifier.trim().toLowerCase();

  const staff = email.includes('@')
    ? await prisma.admin_staff.findUnique({ where: { email } })
    : null;

  const hash = staff?.password_hash ?? (await decoyHash());
  const passwordMatches = await verifyPassword(password, hash);

  // A role that no longer exists signs nobody in rather than granting nothing
  // quietly. (The foreign key makes this unreachable; the check is cheap.)
  if (
    staff &&
    staff.is_active &&
    passwordMatches &&
    (await getRole(staff.role)) !== null
  ) {
    await prisma.admin_staff.update({
      where: { id: staff.id },
      data: { last_login_at: new Date() },
    });
    return {
      ok: true,
      subject: staff.id,
      role: staff.role,
      version: staff.session_version,
    };
  }

  if (!staff && breakGlassConfigured()) {
    const userMatches = safeEqual(email, adminUsername().trim().toLowerCase());
    const envPasswordMatches = safeEqual(password, adminPassword());
    if (userMatches && envPasswordMatches) {
      return {
        ok: true,
        subject: BREAK_GLASS_SUBJECT,
        role: 'super_admin',
        version: currentBreakGlassVersion(),
      };
    }
  }

  return { ok: false };
}

export async function startSession(input: {
  subject: string;
  role: string;
  version: number;
}): Promise<void> {
  const { token, expiresAt } = await signSession(input);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Off in dev so the cookie survives plain http://localhost:3002.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Who is signed in, re-validated against the database.
 *
 * Memoised for the render pass so a layout and five components asking "who is
 * this?" read the row once. Returns null when the token is valid but the
 * staff member has since been deactivated, deleted, or had their sessions
 * revoked (`session_version` bumped) — that is the moment those actions take
 * effect, rather than whenever the 12-hour cookie expires.
 *
 * The ROLE comes from the row, not the token: a demotion applies on the next
 * request even if the version was somehow not bumped.
 */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const cookieStore = await cookies();
  const session = await verifySessionToken(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  if (!session) return null;

  if (session.subject === BREAK_GLASS_SUBJECT) {
    if (!breakGlassConfigured()) return null;
    if (session.version !== currentBreakGlassVersion()) return null;
    const username = adminUsername();
    return {
      id: null,
      email: username,
      name: 'Break-glass admin',
      role: 'super_admin',
      roleLabel: 'Super Admin',
      capabilities: ROLE_CAPABILITIES.super_admin,
      isBreakGlass: true,
      sessionExpiresAt: session.expiresAt,
      actor: `${username} (break-glass)`,
    };
  }

  const row = await prisma.admin_staff.findUnique({
    where: { id: session.subject },
  });
  if (!row || !row.is_active || row.session_version !== session.version) {
    return null;
  }
  // Capabilities come from the role row on every request, so editing a role
  // applies to everyone who holds it on their next click.
  const role = await getRole(row.role);
  if (!role) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.full_name,
    role: role.key,
    roleLabel: role.name,
    capabilities: role.capabilities,
    isBreakGlass: false,
    sessionExpiresAt: session.expiresAt,
    actor: row.email,
  };
});

export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect('/login');
  return staff;
}

export function can(staff: Staff, capability: Capability): boolean {
  return staff.capabilities.has(capability);
}

/**
 * For pages and route handlers: sign-in plus one capability, or a redirect to
 * the no-access page (which names what was missing).
 */
export async function requireCapability(
  capability: Capability
): Promise<Staff> {
  const staff = await requireStaff();
  if (!can(staff, capability)) {
    redirect(`/no-access?need=${encodeURIComponent(capability)}`);
  }
  return staff;
}

/**
 * The only two refusals `authorizeAction` produces. Literal, non-empty
 * strings on purpose: a plain `string` could be `''`, which is falsy, so
 * `if (auth.error) return …` would not narrow `auth.staff` to defined for
 * TypeScript. Literals are always truthy, so it does.
 */
export type AuthRefusal =
  | 'Your session has ended. Sign in again.'
  | 'Your role does not allow this change.';

/**
 * For Server Actions, which report into a form rather than navigate: returns
 * the staff member, or an error message for the form. Use as
 * `const auth = await authorizeAction(cap); if (auth.error) return { error: auth.error };`
 * after which `auth.staff` is defined.
 */
export async function authorizeAction(
  capability: Capability
): Promise<
  | { staff: Staff; error?: undefined }
  | { staff?: undefined; error: AuthRefusal }
> {
  const staff = await getStaff();
  if (!staff) return { error: 'Your session has ended. Sign in again.' };
  if (!can(staff, capability)) {
    return { error: 'Your role does not allow this change.' };
  }
  return { staff };
}
