import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RequireRole } from '../auth/decorators/require-role.decorator';
import { CurrentAccount } from '../auth/decorators/current-account.decorator';
import type { SupabaseAccountContext } from '../auth/types/account-context.type';
import { InternalDispatchGuard } from './guards/internal-dispatch.guard';
import { AutomationDispatchService } from './services/automation-dispatch.service';
import { TriggerAutomationDto } from './dto/trigger-automation.dto';
import { InternalDispatchDto } from './dto/internal-dispatch.dto';

/**
 * Trigger types the manual endpoint may fire. Every other trigger is
 * raised by a real event (an inbound message, a form submission, a tag)
 * and letting a signed-in user forge one with arbitrary context would run
 * any account automation on demand — including sends to any contact.
 * Nothing in apps/web calls this route today; `time_based` is the one
 * trigger with no inbound-event meaning, so it is the safe test hook.
 */
export const MANUAL_TRIGGER_TYPES: readonly string[] = ['time_based'];

@Controller()
export class AutomationsEngineController {
  constructor(private readonly dispatch: AutomationDispatchService) {}

  /**
   * Manual/testing trigger entrypoint — user-facing, cookie-authenticated.
   * Ported from apps/web's POST /api/automations/engine.
   */
  @Post('automations/engine')
  @UseGuards(SupabaseAuthGuard)
  @RequireRole('admin')
  async trigger(
    @CurrentAccount() account: SupabaseAccountContext,
    @Body() body: TriggerAutomationDto,
  ) {
    if (!MANUAL_TRIGGER_TYPES.includes(body.trigger_type)) {
      throw new BadRequestException(
        `Trigger "${body.trigger_type}" cannot be fired manually.`,
      );
    }
    await this.dispatch.dispatch({
      accountId: account.accountId,
      triggerType: body.trigger_type,
      contactId: body.contact_id ?? null,
      context: body.context ?? {},
    });
    return { ok: true };
  }

  /**
   * Internal, machine-to-machine bridge — called by apps/web's WhatsApp
   * webhook route (fire-and-forget) instead of the in-process
   * `runAutomationsForTrigger` call it used before the engine moved here.
   */
  @Post('internal/automations/dispatch')
  @UseGuards(InternalDispatchGuard)
  @HttpCode(202)
  async internalDispatch(@Body() body: InternalDispatchDto) {
    await this.dispatch.dispatch({
      accountId: body.account_id,
      triggerType: body.trigger_type,
      contactId: body.contact_id ?? null,
      context: body.context ?? {},
    });
    return { accepted: true };
  }
}
