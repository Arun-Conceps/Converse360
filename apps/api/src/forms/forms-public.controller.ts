import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';

import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { FormsService } from './services/forms.service';
import { FormSubmitService } from './services/form-submit.service';
import { BookingService } from './services/booking.service';
import type { PublicForm } from './form.types';
import type { SubmitFormResult } from './services/form-submit.service';
import {
  MAX_SUBMIT_BYTES,
  enforceRateLimit,
  issueRenderToken,
  payloadBytes,
  requestIp,
  sanitiseUtm,
} from './form-public-guard';

class PublicSubmitMetaDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;

  /** Shallow string map; re-shaped by sanitiseUtm (caps count and lengths). */
  @IsOptional()
  @IsObject()
  utm?: Record<string, unknown>;
}

/**
 * Wire name of the honeypot field inside `spam`: `{ spam: { honeypot } }`.
 * Renderers must include a CSS-hidden input that posts under this key; any
 * non-empty value is treated as a bot (see FormSubmitService.assertNotSpam).
 */
export const FORM_HONEYPOT_FIELD = 'honeypot';

class PublicSubmitSpamDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  honeypot?: string;

  @IsOptional()
  @IsNumber()
  elapsedMs?: number;

  /** Server-issued render token echoed back from the render response. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  token?: string;
}

export class PublicSubmitDto {
  @IsObject()
  answers!: Record<string, unknown>;

  /**
   * Declared origin of the submission. Advisory only — see the note in
   * `submitBySlug` on why 'widget' cannot be claimed here.
   */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  source?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PublicSubmitMetaDto)
  meta?: PublicSubmitMetaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PublicSubmitSpamDto)
  spam?: PublicSubmitSpamDto;
}

/** Per-minute ceilings. Per-IP buckets bound one client; the per-form
 *  bucket bounds a distributed script against a single form. */
const LIMITS = {
  submitIp: Number(process.env.FORM_SUBMIT_PER_IP_PER_MIN) || 10,
  submitForm: Number(process.env.FORM_SUBMIT_PER_FORM_PER_MIN) || 200,
  // Render/slots are cheap reads, and the hosted page renders them from the
  // web server, so many visitors can share one source IP until `trust proxy`
  // is configured. Generous on purpose.
  read: Number(process.env.FORM_READ_PER_IP_PER_MIN) || 600,
};

/**
 * Public-facing endpoints for form render and submission.
 *
 * These receive anonymous traffic from the hosted form page, embedded
 * snippets, and the widget — they carry no Supabase auth token.
 *
 * Rate limiting lives in the NestJS ThrottlerModule (request-level,
 * IP-keyed). Size-capping is via NestJS's built-in `bodyParser` limit.
 * Spam controls (honeypot, min_seconds) are enforced in FormSubmitService.
 */
@Controller('public/forms')
export class FormsPublicController {
  constructor(
    private readonly forms: FormsService,
    private readonly submit: FormSubmitService,
    private readonly bookings: BookingService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * Slots a booking form currently has free.
   *
   * Computed per request, never cached. A cached slot list is a list of times
   * that may already be taken, and the whole reason this exists rather than a
   * plain date field is that the times offered are real.
   *
   * `from`/`to` narrow it to what the picker is showing, so paging a month
   * forward does not compute a year.
   */
  @Get(':slug/slots')
  async slots(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await enforceRateLimit(
      this.rateLimit,
      `form:slots:${slug}:${requestIp(req)}`,
      LIMITS.read,
    );
    const form = await this.forms.findPublicBySlug(slug);
    if (!form) throw new NotFoundException('Form not found.');
    return this.bookings.slotsFor(form.form.id, { from, to });
  }

  /**
   * Render a published form by slug.
   *
   * The response is the public projection (no mapping/notify internals).
   * Responding with 404 for un-published slugs is intentional: probing
   * guessed slugs returns nothing more than "no form here".
   */
  @Get(':slug')
  async render(
    @Req() req: Request,
    @Param('slug') slug: string,
  ): Promise<PublicForm & { spam_token?: string }> {
    await enforceRateLimit(
      this.rateLimit,
      `form:render:${slug}:${requestIp(req)}`,
      LIMITS.read,
    );
    const result = await this.forms.findPublicBySlug(slug);
    if (!result) throw new NotFoundException('Form not found.');
    // Server-issued render time, echoed back on submit as spam.token so the
    // minimum-time check does not rest on a number the client chooses.
    const spamToken = issueRenderToken(result.form.id);
    return spamToken ? { ...result.form, spam_token: spamToken } : result.form;
  }

  /**
   * Submit answers for a published form.
   *
   * The body is deliberately untyped on the way in (client sends whatever
   * field values it has) and re-validated server-side by FormSubmitService
   * before anything touches the DB.
   *
   * THIS ENDPOINT NEVER ACCEPTS A CONTACT OR CONVERSATION ID
   *   It used to take `contactId` / `conversationId` from the body. That is
   *   an unauthenticated endpoint, so those were attacker-chosen values,
   *   and two things followed from it:
   *
   *     * `form_submissions.contact_id` has a foreign key but no account
   *       constraint, so a submission could be stapled onto ANOTHER
   *       tenant's contact — their contact timeline would then show a
   *       stranger's form answers.
   *     * `FormSubmitService` forwards it to the contact resolver as
   *       `existingContactId`, which is the input that drives the web-stub
   *       merge. Feeding that an arbitrary uuid points identity resolution
   *       at a contact the submitter has no relationship with.
   *
   *   Identity on a public form comes only from the answers themselves,
   *   resolved by `FormContactResolverService`. A submission that should be
   *   attached to a live chat goes through `POST /public/web/forms/:id/submit`
   *   instead, where the visitor session token proves which conversation is
   *   theirs.
   *
   *   `source` is likewise clamped: a caller here cannot claim to be the
   *   widget, because that would misattribute traffic in the submissions
   *   list and in the dashboard's source breakdown.
   */
  @Post(':slug/submit')
  @HttpCode(200)
  async submitBySlug(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Body() body: PublicSubmitDto,
  ): Promise<SubmitFormResult> {
    const ip = requestIp(req);
    await enforceRateLimit(
      this.rateLimit,
      `form:submit:${slug}:${ip}`,
      LIMITS.submitIp,
    );
    await enforceRateLimit(
      this.rateLimit,
      `form:submit-form:${slug}`,
      LIMITS.submitForm,
    );
    const form = await this.forms.findPublicBySlug(slug);
    if (!form) throw new NotFoundException('Form not found.');

    if (!body?.answers || typeof body.answers !== 'object') {
      throw new BadRequestException('answers is required.');
    }
    if (
      payloadBytes({ answers: body.answers, meta: body.meta }) >
      MAX_SUBMIT_BYTES
    ) {
      throw new PayloadTooLargeException('That submission is too large.');
    }

    return this.submit.submit({
      accountId: form.accountId,
      ownerUserId: form.ownerUserId,
      formId: form.form.id,
      fields: form.rawFields,
      settings: form.settings,
      answers: body.answers,
      source: body.source === 'embed' ? 'embed' : 'hosted',
      meta: {
        pageUrl: body.meta?.pageUrl,
        referrer: body.meta?.referrer,
        utm: sanitiseUtm(body.meta?.utm),
        // Server-observed, never client-supplied: stored as a salted hash.
        ip,
        userAgent: req.headers['user-agent'],
      },
      spam: body.spam,
    });
  }
}
