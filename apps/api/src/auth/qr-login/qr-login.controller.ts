import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CurrentUserId,
  SupabaseUserGuard,
} from '../guards/supabase-user.guard';
import { QrLoginService } from './qr-login.service';

/**
 * `start` and `status` are PUBLIC on purpose: the browser asking for them is
 * not signed in yet. They are safe because the secret is the credential and
 * is useless without a signed-in phone approving it. `approve` is the only
 * one that needs an identity.
 */
@Controller('auth/qr')
export class QrLoginController {
  constructor(private readonly qr: QrLoginService) {}

  @Post('start')
  start(@Req() req: Request) {
    return this.qr.start(
      req.ip ?? 'unknown',
      req.headers['user-agent'] ?? '',
    );
  }

  @Get('status')
  status(@Query('id') id: string, @Query('secret') secret: string) {
    return this.qr.poll(id, secret);
  }

  /** Same as GET, but the secret travels in the body, not in URLs/logs. */
  @Post('status')
  statusPost(@Body() body: { id?: string; secret?: string }) {
    return this.qr.poll(body?.id ?? '', body?.secret ?? '');
  }

  /** Where was this QR started? Call before `approve` to show the user. */
  @Post('peek')
  @UseGuards(SupabaseUserGuard)
  peek(
    @CurrentUserId() userId: string,
    @Body() body: { id?: string; secret?: string },
  ) {
    return this.qr.peek(userId, body?.id ?? '', body?.secret ?? '');
  }

  @Post('approve')
  @UseGuards(SupabaseUserGuard)
  approve(
    @CurrentUserId() userId: string,
    @Body() body: { id?: string; secret?: string },
  ) {
    return this.qr.approve(userId, body?.id ?? '', body?.secret ?? '');
  }
}
