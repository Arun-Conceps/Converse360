import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { optedOutIds } from '../../common/contacts/contact-opt-out';
import { BroadcastQueueService } from '../../queue/broadcast-queue.service';

const TICK_MS = 30_000;
const BATCH = 50;

/**
 * Releases scheduled broadcasts when their time comes.
 *
 * The `broadcasts` row is the schedule (status 'scheduled' + scheduled_at),
 * so nothing is lost if Redis is flushed or the API restarts: the next
 * tick finds every overdue row and releases it, late rather than never.
 * Releasing is only "scheduled -> queued, then enqueue" - delivery stays
 * on the existing orchestrator/recipient queues.
 *
 * Safe with several API instances: the claim is a conditional UPDATE, so
 * exactly one instance moves a row out of 'scheduled'.
 */
@Injectable()
export class BroadcastScheduleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastScheduleService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastQueue: BroadcastQueueService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.releaseDue().catch((err: unknown) =>
        this.logger.error(
          `schedule sweep failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Release every overdue scheduled broadcast. Returns how many started. */
  async releaseDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.broadcasts.findMany({
      where: { status: 'scheduled', scheduled_at: { lte: now } },
      select: { id: true, account_id: true },
      orderBy: { scheduled_at: 'asc' },
      take: BATCH,
    });

    let released = 0;
    for (const b of due) {
      const claim = await this.prisma.broadcasts.updateMany({
        where: { id: b.id, status: 'scheduled' },
        data: { status: 'queued', updated_at: new Date() },
      });
      if (claim.count !== 1) continue; // another instance, or cancelled

      // Somebody may have replied STOP since this was scheduled. The
      // audience was fixed at scheduling time, so re-check at send time.
      const pending = await this.prisma.broadcast_recipients.findMany({
        where: { broadcast_id: b.id, status: 'pending' },
        select: { id: true, contact_id: true },
      });
      const contactIds = pending
        .map((r) => r.contact_id)
        .filter((c): c is string => !!c);
      const out = await optedOutIds(this.prisma, b.account_id, contactIds);
      if (out.size > 0) {
        await this.prisma.broadcast_recipients.deleteMany({
          where: {
            broadcast_id: b.id,
            status: 'pending',
            contact_id: { in: [...out] },
          },
        });
      }
      const remaining = pending.length - out.size;
      await this.prisma.broadcasts.update({
        where: { id: b.id },
        data: {
          total_recipients: remaining,
          ...(remaining === 0 ? { status: 'cancelled' } : {}),
        },
      });
      if (remaining === 0) continue;

      await this.broadcastQueue.enqueueBroadcast(b.id);
      released++;
    }
    if (released > 0) {
      this.logger.log(`released ${released} scheduled broadcast(s)`);
    }
    return released;
  }

  /** Cancel a broadcast that has not started. False if it already has. */
  async cancel(accountId: string, id: string): Promise<boolean> {
    const r = await this.prisma.broadcasts.updateMany({
      where: { id, account_id: accountId, status: 'scheduled' },
      data: { status: 'cancelled', updated_at: new Date() },
    });
    return r.count === 1;
  }
}
