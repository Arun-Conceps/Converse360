import { createHash, timingSafeEqual } from 'node:crypto';

export interface DashboardCredentials {
  user: string;
  password: string;
}

/**
 * The queue dashboard's credentials, or null when it should not exist.
 *
 * ⚠️ **Why this is not the app's own login.** /admin/queues shows job
 * payloads for every tenant on the instance — phone numbers, message
 * text, contact ids, whatever a job carries. A workspace admin passing
 * `SupabaseAuthGuard` is an admin *of one workspace*, and showing them
 * that is precisely the cross-tenant leak this codebase has already
 * shipped twice (see CLAUDE.md, "Tenant-scoping traps"). Cross-tenant
 * tooling gets its own credential, exactly like apps/admin-panel does.
 *
 * Absent or blank env → null → the route is never mounted. Off by
 * default is the right default for an unauthenticated-by-omission
 * operations console: forgetting to set a password must not publish
 * one.
 */
export function readDashboardCredentials(
  env: NodeJS.ProcessEnv = process.env,
): DashboardCredentials | null {
  const user = env.QUEUE_DASHBOARD_USER?.trim();
  const password = env.QUEUE_DASHBOARD_PASSWORD?.trim();
  if (!user || !password) return null;
  return { user, password };
}

/**
 * Constant-time string comparison.
 *
 * Hashed first so both sides are always 32 bytes: `timingSafeEqual`
 * throws on a length mismatch, and catching that throw would itself
 * leak the length of the secret through timing.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Verify an `Authorization: Basic …` header against the configured
 * credentials.
 *
 * Both fields are always compared, even when the username has already
 * failed, so the response time does not distinguish "no such user" from
 * "wrong password".
 */
export function checkBasicAuth(
  header: string | undefined,
  creds: DashboardCredentials,
): boolean {
  if (!header?.startsWith('Basic ')) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return false;
  }

  // Split on the FIRST colon only: a password may contain colons, a
  // username may not (RFC 7617).
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;

  const userOk = safeEqual(decoded.slice(0, sep), creds.user);
  const passOk = safeEqual(decoded.slice(sep + 1), creds.password);
  return userOk && passOk;
}

/**
 * Per-IP failed-attempt throttle for the dashboard login. In-memory: a
 * restart resets it, which is acceptable for an ops console that is also
 * behind a reverse proxy.
 */
export class AuthThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const list = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length > 0) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.maxFailures;
  }

  recordFailure(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.failures.set(key, list);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
