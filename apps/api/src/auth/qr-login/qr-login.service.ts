import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';

/** A QR is good for two minutes: long enough to find your phone, short enough
 *  that a screenshot of it is worthless by the time anyone could use it. */
const TTL_SECONDS = 120;
const ID_RE = /^[0-9a-f]{32}$/;
const SECRET_RE = /^[0-9a-f]{64}$/;

const sha256 = (v: string) => createHash('sha256').update(v).digest();
const key = (id: string) => `qrlogin:${id}`;

export type QrStatus =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'approved'; tokenHash: string };

/**
 * Sign the WEB in by scanning a QR with a phone that is already signed in.
 *
 *   web    POST start            -> {id, secret}; QR = both. Redis keeps only
 *                                   sha256(secret), so reading Redis cannot
 *                                   complete a login.
 *   phone  POST approve          -> proves who it is (Bearer), and presents the
 *                                   secret it scanned. We mint a one-time
 *                                   Supabase magic-link token for THAT user.
 *   web    GET status (polling)  -> receives the token ONCE and the record is
 *                                   deleted; the browser exchanges it with
 *                                   `verifyOtp`, which creates its OWN session
 *                                   (not a copy of the phone's, so refresh
 *                                   rotation never signs one out the other).
 *
 * The service-role key is used for exactly two admin calls here and never
 * leaves this file: it must not reach a response, a log line or a job payload.
 */
@Injectable()
export class QrLoginService {
  private readonly log = new Logger(QrLoginService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly limiter: RateLimitService,
  ) {}

  async start(ip: string, userAgent = '') {
    await this.throttle(`qr-start:${ip}`, 20, 60_000);
    const id = randomBytes(16).toString('hex');
    const secret = randomBytes(32).toString('hex');
    await this.redis
      .multi()
      .hset(key(id), {
        secret: sha256(secret).toString('hex'),
        status: 'pending',
        // Shown on the approving phone so a user can spot a QR that was
        // started by somebody else (QR-phishing / "quishing").
        ip,
        ua: userAgent.slice(0, 200),
        createdAt: String(Date.now()),
      })
      .expire(key(id), TTL_SECONDS)
      .exec();
    return { id, secret, expiresIn: TTL_SECONDS };
  }

  async poll(id: string, secret: string): Promise<QrStatus> {
    this.assertShape(id, secret);
    await this.throttle(`qr-poll:${id}`, 120, 60_000);
    const rec = await this.redis.hgetall(key(id));
    if (!rec.secret) return { status: 'expired' };
    if (!this.matches(rec.secret, secret)) throw new NotFoundException();
    if (rec.status !== 'approved') return { status: 'pending' };
    // One-time: whoever deletes the record first owns the token.
    const taken = await this.redis.del(key(id));
    if (taken !== 1) return { status: 'expired' };
    return { status: 'approved', tokenHash: rec.tokenHash };
  }

  /** Read-only: who started this QR? Lets the phone show origin BEFORE approving. */
  async peek(userId: string, id: string, secret: string) {
    this.assertShape(id, secret);
    await this.throttle(`qr-approve:${userId}`, 20, 60_000);
    const rec = await this.redis.hgetall(key(id));
    if (!rec.secret) throw new NotFoundException('This QR code has expired.');
    if (!this.matches(rec.secret, secret)) throw new NotFoundException();
    return this.origin(rec);
  }

  private origin(rec: Record<string, string>) {
    return {
      ip: rec.ip ?? null,
      userAgent: rec.ua ?? null,
      startedAt: rec.createdAt ? Number(rec.createdAt) : null,
    };
  }

  async approve(userId: string, id: string, secret: string) {
    this.assertShape(id, secret);
    await this.throttle(`qr-approve:${userId}`, 20, 60_000);
    const rec = await this.redis.hgetall(key(id));
    if (!rec.secret) throw new NotFoundException('This QR code has expired.');
    if (!this.matches(rec.secret, secret)) throw new NotFoundException();
    if (rec.status !== 'pending')
      throw new ConflictException('This QR code was already used.');

    const tokenHash = await this.mintLoginToken(userId);
    // Only the first approval may write.
    const won = await this.redis.eval(
      "if redis.call('hget', KEYS[1], 'status') == 'pending' then " +
        "redis.call('hset', KEYS[1], 'status', 'approved', 'tokenHash', ARGV[1]) " +
        'return 1 end return 0',
      1,
      key(id),
      tokenHash,
    );
    if (won !== 1)
      throw new ConflictException('This QR code was already used.');
    return { ok: true, origin: this.origin(rec) };
  }

  // ── internals ──────────────────────────────────────────────────────────

  private assertShape(id: string, secret: string) {
    if (!ID_RE.test(id ?? '') || !SECRET_RE.test(secret ?? ''))
      throw new BadRequestException('Malformed QR code.');
  }

  private matches(storedHashHex: string, secret: string) {
    const a = Buffer.from(storedHashHex, 'hex');
    const b = sha256(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async throttle(k: string, limit: number, windowMs: number) {
    const r = await this.limiter.check(k, { limit, windowMs });
    if (!r.success) throw new HttpException('Too many attempts.', 429);
  }

  private adminHeaders() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey)
      throw new ServiceUnavailableException('QR sign-in is not configured.');
    return {
      url,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    };
  }

  /** Resolves the approving user's email and mints a one-time magic-link
   *  token for it. The email comes from the VERIFIED user id, never from the
   *  request body, so a caller can only ever sign the web in as themselves. */
  private async mintLoginToken(userId: string): Promise<string> {
    const { url, headers } = this.adminHeaders();
    const u = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers });
    if (!u.ok) throw new ServiceUnavailableException('Could not look you up.');
    const email = ((await u.json()) as { email?: string }).email;
    if (!email) throw new BadRequestException('This account has no email.');

    const g = await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    if (!g.ok) {
      this.log.warn(`generate_link failed: ${g.status}`);
      throw new ServiceUnavailableException('Could not start the session.');
    }
    const hashed = ((await g.json()) as { hashed_token?: string }).hashed_token;
    if (!hashed)
      throw new ServiceUnavailableException('Could not start the session.');
    return hashed;
  }
}
