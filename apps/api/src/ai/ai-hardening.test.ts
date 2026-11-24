import { describe, expect, it, vi } from 'vitest';

const loadAiConfig = vi.fn();
vi.mock('./lib/config', () => ({
  loadAiConfig: (...a: unknown[]) => loadAiConfig(...a),
}));
const crawlPage = vi.fn();
vi.mock('./lib/crawl', () => ({
  crawlPage: (...a: unknown[]) => crawlPage(...a),
}));
const generateReply = vi.fn();
vi.mock('./lib/generate', () => ({
  generateReply: (...a: unknown[]) => generateReply(...a),
}));

import { secretMatches } from './lib/secret-compare';
import { BUILTIN_TOOLS, MUTATING_BUILTIN_TOOLS } from './lib/tools/builtin';
import { enabledSkillTools } from './lib/skills';
import {
  AgentRuntimeService,
  isReadOnlyMethod,
} from './services/agent-runtime.service';
import {
  KnowledgeSourceService,
  MAX_KNOWLEDGE_DOCUMENTS,
  MAX_KNOWLEDGE_TOTAL_BYTES,
} from './services/knowledge-source.service';
import { AgentConfigService } from './services/agent-config.service';

describe('secretMatches', () => {
  it('matches equal secrets only', () => {
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abd', 'abc')).toBe(false);
    expect(secretMatches('ab', 'abc')).toBe(false);
  });
  it('never matches when either side is empty/unset', () => {
    expect(secretMatches(undefined, undefined)).toBe(false);
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches('x', undefined)).toBe(false);
  });
});

describe('draft mode withholds every mutating tool', () => {
  function toolset(mode: 'draft' | 'auto_reply') {
    const service = new AgentRuntimeService(
      {} as never,
      {} as never,
      { run: vi.fn() } as never,
    );
    const skills: Record<string, { enabled: boolean; config: object }> = {};
    for (const id of [
      'lead_qualification',
      'create_deal',
      'assign_deal_to_member',
      'trigger_automation',
    ]) {
      skills[id] = { enabled: true, config: {} };
    }
    const { tools } = (
      service as unknown as {
        buildToolset: (a: unknown) => { tools: { name: string }[] };
      }
    ).buildToolset({
      config: {
        skills,
        profile: { storeCurrency: 'INR' },
        voice: {},
        escalation: {},
      },
      ctx: {
        accountId: 'a',
        contactId: 'c',
        conversationId: 'v',
        actorUserId: null,
        mode,
      },
      actions: [
        { id: '1', name: 'get_status', method: 'GET', parameters: [] },
        { id: '2', name: 'head_status', method: 'head', parameters: [] },
        { id: '3', name: 'create_ticket', method: 'POST', parameters: [] },
        { id: '4', name: 'remove_x', method: 'DELETE', parameters: [] },
      ],
      googleConnected: false,
    });
    return tools.map((t) => t.name);
  }

  it('offers writing tools live but none in draft', () => {
    const live = toolset('auto_reply');
    const draft = toolset('draft');
    expect(MUTATING_BUILTIN_TOOLS.some((n) => live.includes(n))).toBe(true);
    for (const name of MUTATING_BUILTIN_TOOLS) {
      expect(draft).not.toContain(name);
    }
  });

  it('keeps only GET/HEAD custom actions in draft', () => {
    const draft = toolset('draft');
    expect(draft).toContain('get_status');
    expect(draft).toContain('head_status');
    expect(draft).not.toContain('create_ticket');
    expect(draft).not.toContain('remove_x');
    expect(toolset('auto_reply')).toContain('create_ticket');
    expect(isReadOnlyMethod('get')).toBe(true);
    expect(isReadOnlyMethod('PATCH')).toBe(false);
  });
});

describe('trigger_automation', () => {
  it('is no longer offered by any skill and never claims success', async () => {
    const tools = enabledSkillTools({
      trigger_automation: { enabled: true, config: {} },
    });
    expect(tools).not.toContain('trigger_automation');
    const res = await BUILTIN_TOOLS.trigger_automation.run({}, {} as never);
    expect(res.ok).toBe(false);
  });
});

describe('assign_deal pinning', () => {
  it('scopes an explicit deal_id to the conversation contact', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const res = await BUILTIN_TOOLS.assign_deal.run(
      { assignee: 'Priya', deal_id: 'deal-of-someone-else' },
      {
        prisma: { deals: { findFirst } },
        accountId: 'acc-1',
        contactId: 'c-1',
      } as never,
    );
    expect(res.ok).toBe(false);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'deal-of-someone-else',
          account_id: 'acc-1',
          contact_id: 'c-1',
        },
      }),
    );
  });

  it('refuses with no contact attached', async () => {
    const findFirst = vi.fn();
    const res = await BUILTIN_TOOLS.assign_deal.run(
      { assignee: 'Priya', deal_id: 'd' },
      {
        prisma: { deals: { findFirst } },
        accountId: 'a',
        contactId: null,
      } as never,
    );
    expect(res.ok).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe('knowledge library caps', () => {
  function prismaWith(count: number, bytes: number) {
    return {
      ai_knowledge_documents: {
        count: vi.fn().mockResolvedValue(count),
        aggregate: vi.fn().mockResolvedValue({ _sum: { byte_size: bytes } }),
      },
    };
  }

  it('refuses past the document cap', async () => {
    const svc = new KnowledgeSourceService(
      prismaWith(MAX_KNOWLEDGE_DOCUMENTS, 0) as never,
      {} as never,
    );
    await expect(
      svc.assertCapacity({ accountId: 'a', addBytes: 10 }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('refuses past the byte cap but lets an edit replace itself', async () => {
    const svc = new KnowledgeSourceService(
      prismaWith(1, MAX_KNOWLEDGE_TOTAL_BYTES - 5) as never,
      {} as never,
    );
    await expect(
      svc.assertCapacity({ accountId: 'a', addBytes: 10 }),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      svc.assertCapacity({ accountId: 'a', addBytes: 3 }),
    ).resolves.toBeUndefined();
  });
});

describe('draftFromWebsite metering', () => {
  const baseConfig = {
    source: 'platform',
    creditBalance: 5,
    provider: 'gemini',
    model: 'm',
    profile: { businessWebsite: 'acme.test' },
  };

  function make(rateOk = true) {
    const credits = { chargeGeneration: vi.fn().mockResolvedValue(1) };
    const rate = { check: vi.fn().mockResolvedValue({ success: rateOk }) };
    const svc = new AgentConfigService(
      {} as never,
      credits as never,
      rate as never,
    );
    return { svc, credits, rate };
  }

  it('is rate limited per account before crawling', async () => {
    loadAiConfig.mockResolvedValue(baseConfig);
    const { svc, rate } = make(false);
    await expect(
      svc.draftFromWebsite({ accountId: 'acc-1' }),
    ).rejects.toMatchObject({ status: 429 });
    expect(rate.check).toHaveBeenCalledWith(
      'ai-draft-site:acc-1',
      expect.any(Object),
    );
    expect(crawlPage).not.toHaveBeenCalled();
  });

  it('refuses an empty platform wallet before crawling', async () => {
    loadAiConfig.mockResolvedValue({ ...baseConfig, creditBalance: 0 });
    const { svc, credits } = make();
    await expect(
      svc.draftFromWebsite({ accountId: 'acc-1' }),
    ).rejects.toMatchObject({ status: 402 });
    expect(crawlPage).not.toHaveBeenCalled();
    expect(credits.chargeGeneration).not.toHaveBeenCalled();
  });

  it('charges the generation on the platform key', async () => {
    loadAiConfig.mockResolvedValue(baseConfig);
    crawlPage.mockResolvedValue({
      url: 'https://acme.test',
      title: 't',
      text: 'x',
    });
    generateReply.mockResolvedValue({
      text: 'We sell things.',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const { svc, credits } = make();
    await svc.draftFromWebsite({ accountId: 'acc-1' });
    expect(credits.chargeGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        feature: 'playground',
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
    );
  });

  it('does not charge a bring-your-own-key run', async () => {
    loadAiConfig.mockResolvedValue({ ...baseConfig, source: 'byok' });
    crawlPage.mockResolvedValue({
      url: 'https://acme.test',
      title: 't',
      text: 'x',
    });
    generateReply.mockResolvedValue({
      text: 'ok',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const { svc, credits } = make();
    await svc.draftFromWebsite({ accountId: 'acc-1' });
    expect(credits.chargeGeneration).not.toHaveBeenCalled();
  });
});
