'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { BREAK_GLASS_SUBJECT } from '@/lib/session';
import { recordAudit } from '@/lib/actions/audit';
import {
  BREAK_GLASS_POLICY,
  FailureLimiter,
  IDENTIFIER_POLICY,
  IP_POLICY,
  clientKey,
  identifierTag,
  ipPrefix,
  normaliseIdentifier,
} from '@/lib/auth-throttle';
import {
  checkCredentials,
  endSession,
  getStaff,
  startSession,
} from '@/lib/auth';

export type LoginState = { error?: string };

// Throttle state is in-memory and per-process (see lib/auth-throttle.ts).
// The reverse proxy MUST set `X-Real-IP $remote_addr` (overwriting any client
// value), or the per-IP bucket degrades to the rightmost X-Forwarded-For entry.
const ipLimiter = new FailureLimiter(IP_POLICY);
const identifierLimiter = new FailureLimiter(IDENTIFIER_POLICY);
const breakGlassLimiter = new FailureLimiter(BREAK_GLASS_POLICY, 4);
const BREAK_GLASS_KEY = 'break-glass';

function isBreakGlassName(identifier: string): boolean {
  const configured = process.env.ADMIN_USERNAME;
  return (
    Boolean(configured) &&
    normaliseIdentifier(identifier) === normaliseIdentifier(configured!)
  );
}

/**
 * Only same-origin paths are honoured. Without this check the `next` parameter
 * is an open redirect: a link to /login?next=https://evil.example would send an
 * admin straight there, having just proved they hold the credentials.
 */
function safeRedirect(target: string | null): string {
  if (!target) return '/';
  if (!target.startsWith('/') || target.startsWith('//')) return '/';
  return target;
}

export async function login(
  _previous: LoginState,
  formData: FormData
): Promise<LoginState> {
  const headerList = await headers();
  const ip = clientKey(
    headerList.get('x-forwarded-for'),
    headerList.get('x-real-ip')
  );

  const username = formData.get('username');
  const password = formData.get('password');
  const next = formData.get('next');

  if (typeof username !== 'string' || typeof password !== 'string') {
    return { error: 'Enter a username and password.' };
  }
  if (!username.trim() || !password) {
    return { error: 'Enter a username and password.' };
  }

  const idKey = normaliseIdentifier(username);
  const breakGlass = isBreakGlassName(username);

  if (
    ipLimiter.lockedFor(ip) > 0 ||
    identifierLimiter.lockedFor(idKey) > 0 ||
    (breakGlass && breakGlassLimiter.lockedFor(BREAK_GLASS_KEY) > 0)
  ) {
    return { error: 'Too many attempts. Wait a while and try again.' };
  }

  const result = await checkCredentials(username, password);
  if (!result.ok) {
    ipLimiter.recordFailure(ip);
    identifierLimiter.recordFailure(idKey);
    if (breakGlass) breakGlassLimiter.recordFailure(BREAK_GLASS_KEY);
    // Never the password, never the raw identifier: a hash tag and a /24.
    await recordAudit({
      actor: 'unauthenticated',
      action: 'auth.login_failed',
      targetType: 'staff',
      summary: breakGlass
        ? 'Failed break-glass sign-in.'
        : 'Failed staff sign-in.',
      detail: {
        identifier: identifierTag(username),
        ip: ipPrefix(ip),
        breakGlass,
      },
    });
    // One message for every failure — unknown email, wrong password,
    // deactivated account: naming which tells an attacker what to try next.
    return { error: 'Those credentials are not valid.' };
  }

  ipLimiter.reset(ip);
  identifierLimiter.reset(idKey);
  if (breakGlass) breakGlassLimiter.reset(BREAK_GLASS_KEY);

  await startSession({
    subject: result.subject,
    role: result.role,
    version: result.version,
  });
  const isBreakGlassSession = result.subject === BREAK_GLASS_SUBJECT;
  await recordAudit({
    actor: isBreakGlassSession
      ? `${process.env.ADMIN_USERNAME} (break-glass)`
      : idKey,
    action: 'auth.login',
    targetType: 'staff',
    targetId: isBreakGlassSession ? null : result.subject,
    summary: isBreakGlassSession
      ? 'Signed in with the break-glass credential.'
      : 'Signed in.',
    detail: { ip: ipPrefix(ip), breakGlass: isBreakGlassSession },
  });

  redirect(safeRedirect(typeof next === 'string' ? next : null));
}

export async function logout(): Promise<void> {
  const staff = await getStaff();
  await endSession();
  if (staff) {
    await recordAudit({
      actor: staff.actor,
      action: 'auth.logout',
      targetType: 'staff',
      targetId: staff.id,
      summary: 'Signed out.',
    });
  }
  redirect('/login');
}
