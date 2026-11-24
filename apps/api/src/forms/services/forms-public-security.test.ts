import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { FormsService } from './forms.service';
import { FormSubmitService } from './form-submit.service';
import { issueRenderToken } from '../form-public-guard';

const textField = {
  field_key: 'name',
  type: 'text',
  label: 'Name',
  required: false,
};

describe('FormsService redirect_url (H-10)', () => {
  const create = vi.fn().mockImplementation(async ({ data }) => ({
    id: 'f1',
    account_id: 'a',
    user_id: 'u',
    name: 'n',
    description: null,
    slug: 's',
    kind: 'form',
    status: 'draft',
    fields: [],
    notify: {},
    availability: null,
    submission_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...data,
  }));
  const prisma = {
    forms: { create, findFirst: vi.fn().mockResolvedValue(null) },
  };
  const svc = new FormsService(prisma as never);

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:1',
    ' \n javascript:1',
    '//evil.test',
  ])('rejects %j at create with 400', async (url) => {
    await expect(
      svc.create('a', 'u', { name: 'n', settings: { redirect_url: url } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts https and normalises empty to null', async () => {
    const ok = await svc.create('a', 'u', {
      name: 'n',
      settings: { redirect_url: 'https://ok.test/x' },
    });
    expect(ok.settings.redirect_url).toBe('https://ok.test/x');
    const none = await svc.create('a', 'u', {
      name: 'n',
      settings: { redirect_url: '' },
    });
    expect(none.settings.redirect_url).toBeNull();
  });
});

describe('FormSubmitService', () => {
  beforeEach(() => {
    process.env.FORM_SPAM_TOKEN_SECRET = 'test-secret';
  });

  function build() {
    const created: Array<{ data: { meta: Record<string, unknown> } }> = [];
    const prisma = {
      form_submissions: {
        create: vi.fn().mockImplementation(async (a) => {
          created.push(a);
          return { id: 's1' };
        }),
        update: vi.fn(),
      },
      forms: { update: vi.fn() },
    };
    const resolver = {
      resolve: vi.fn().mockResolvedValue({ contactId: null, created: false }),
      applyCustomFields: vi.fn(),
    };
    const dispatch = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const webhook = { deliver: vi.fn().mockResolvedValue(undefined) };
    const booking = {};
    const svc = new FormSubmitService(
      prisma as never,
      resolver as never,
      dispatch as never,
      webhook as never,
      booking as never,
    );
    // fan-out is fire-and-forget and irrelevant here
    (svc as never as { fanOut: () => Promise<void> }).fanOut = async () => {};
    return { svc, created };
  }

  const base = (over: object = {}, settings: object = {}) => ({
    accountId: 'a',
    ownerUserId: 'u',
    formId: 'f1',
    fields: [textField] as never,
    settings: {
      submit_label: 'Go',
      success_mode: 'redirect' as const,
      success_message: 'ty',
      redirect_url: 'https://ok.test/',
      honeypot: true,
      min_seconds: 3,
      captcha: false,
      ...settings,
    },
    answers: { name: 'x' },
    source: 'hosted' as const,
    ...over,
  });

  it('returns a safe redirect, drops a stored javascript: one', async () => {
    const { svc } = build();
    expect((await svc.submit(base())).redirectUrl).toBe('https://ok.test/');
    const bad = await svc.submit(
      base({}, { redirect_url: 'javascript:alert(1)' }),
    );
    expect(bad.redirectUrl).toBeNull();
  });

  it('accepts a submission without a token but flags it', async () => {
    const { svc, created } = build();
    await svc.submit(base());
    expect(created[0].data.meta.spam_suspected).toBe('no_timing_token');
  });

  it('omitting spam entirely cannot dodge a valid-but-fresh token', async () => {
    const { svc } = build();
    const fresh = issueRenderToken('f1', Date.now())!;
    await expect(
      svc.submit(base({ spam: { token: fresh, elapsedMs: 999999 } })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a token old enough, with no flag', async () => {
    const { svc, created } = build();
    const old = issueRenderToken('f1', Date.now() - 10_000)!;
    await svc.submit(base({ spam: { token: old } }));
    expect(created[0].data.meta.spam_suspected).toBeUndefined();
  });

  it('a forged token is flagged, not trusted', async () => {
    const { svc, created } = build();
    await svc.submit(
      base({ spam: { token: `${Date.now() - 99999}.${'a'.repeat(64)}` } }),
    );
    expect(created[0].data.meta.spam_suspected).toBe('invalid_timing_token');
  });
});
