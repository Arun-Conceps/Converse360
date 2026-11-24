import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RequireRole } from '../auth/decorators/require-role.decorator';
import { CurrentAccount } from '../auth/decorators/current-account.decorator';
import type { SupabaseAccountContext } from '../auth/types/account-context.type';
import type { Request } from 'express';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { enforceRateLimit, requestIp } from './form-public-guard';
import { BookingService, type BookingJson } from './services/booking.service';

class SetBookingStatusDto {
  @IsIn(['confirmed', 'cancelled', 'completed', 'no_show'])
  status!: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
}

class PublicRescheduleDto {
  @IsString()
  @MaxLength(40)
  start!: string;
}

class PublicCancelDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Bookings for the dashboard.
 *
 * There is no create endpoint. A booking is made by submitting the form that
 * carries the slot picker — routing it any other way would let a booking exist
 * without the answers that came with it, and would need a second copy of the
 * availability re-check.
 */
@Controller('bookings')
@UseGuards(SupabaseAuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingService) {}

  @Get()
  async list(
    @CurrentAccount() account: SupabaseAccountContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('form_id') formId?: string,
  ): Promise<BookingJson[]> {
    return this.bookings.list(account.accountId, {
      from: parseDate(from),
      to: parseDate(to),
      formId,
    });
  }

  /** Mark completed / no-show / cancelled from the calendar. */
  @Patch(':id/status')
  @RequireRole('agent')
  async setStatus(
    @CurrentAccount() account: SupabaseAccountContext,
    @Param('id') id: string,
    @Body() body: SetBookingStatusDto,
  ): Promise<BookingJson> {
    return this.bookings.setStatus(account.accountId, id, body.status);
  }
}

/**
 * The customer's own reschedule/cancel surface, reached from the link in their
 * confirmation.
 *
 * AUTHORISED BY THE TOKEN ALONE, WHICH IS THE POINT
 *   The person who booked has no account here and never will — asking them to
 *   sign in to move an appointment is how a booking product loses to a phone
 *   call. So the `manage_token` is the credential: 32 random bytes, unique,
 *   and the only thing that resolves to a booking.
 *
 *   That makes token handling load-bearing. It is never logged, never returned
 *   by a listing endpoint, and every lookup is by exact token — there is no
 *   endpoint that enumerates or partially matches them.
 */
@Controller('public/bookings')
export class BookingsPublicController {
  constructor(
    private readonly bookings: BookingService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * The token is the only credential, so guessing it must be expensive:
   * per-IP buckets on every route, tighter on the writes.
   */
  private limit(req: Request, bucket: string, perMinute: number) {
    return enforceRateLimit(
      this.rateLimit,
      `booking:${bucket}:${requestIp(req)}`,
      perMinute,
    );
  }

  @Get(':token')
  async get(
    @Req() req: Request,
    @Param('token') token: string,
  ): Promise<BookingJson> {
    await this.limit(req, 'get', 20);
    return this.bookings.findByToken(token);
  }

  /**
   * Slots available to move this booking to.
   *
   * Routed through the token rather than taking a form id, so the customer
   * cannot browse the availability of forms they were never sent.
   */
  @Get(':token/slots')
  async slots(@Req() req: Request, @Param('token') token: string) {
    await this.limit(req, 'slots', 20);
    const booking = await this.bookings.findByToken(token);
    return this.bookings.slotsFor(booking.form_id);
  }

  @Post(':token/reschedule')
  async reschedule(
    @Req() req: Request,
    @Param('token') token: string,
    @Body() body: PublicRescheduleDto,
  ): Promise<BookingJson> {
    await this.limit(req, 'reschedule', 10);
    return this.bookings.reschedule(token, body.start);
  }

  @Post(':token/cancel')
  async cancel(
    @Req() req: Request,
    @Param('token') token: string,
    @Body() body: PublicCancelDto,
  ): Promise<BookingJson> {
    await this.limit(req, 'cancel', 10);
    return this.bookings.cancel(token, body.reason);
  }
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
