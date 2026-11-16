import { describe, expect, it } from 'vitest';

import {
  ALL_CAPABILITIES,
  MODULES,
  ROLE_CAPABILITIES,
  capabilitiesRequiring,
  normaliseCapabilities,
  roleKeyFromName,
} from '@/lib/staff/roles';

describe('modules', () => {
  it('list every capability exactly once', () => {
    const listed = MODULES.flatMap((m) => [...m.capabilities]).sort();
    expect(listed).toEqual([...ALL_CAPABILITIES].sort());
  });
});

describe('normaliseCapabilities', () => {
  it('always includes clients.read, so every role can open the Overview', () => {
    expect(normaliseCapabilities([])).toEqual(['clients.read']);
    expect(normaliseCapabilities(['tickets.work'])).toContain('clients.read');
  });

  it('adds what a permission depends on', () => {
    const caps = normaliseCapabilities(['billing.manage']);
    expect(caps).toContain('billing.read');
    expect(normaliseCapabilities(['credits.adjust'])).toContain('billing.read');
    expect(normaliseCapabilities(['catalog.manage'])).toContain(
      'catalog.read_mapping'
    );
  });

  it('drops names the code does not know, so a stale row grants nothing', () => {
    expect(normaliseCapabilities(['root', 'staff.manage ', 42, null])).toEqual([
      'clients.read',
    ]);
  });

  it('returns the stable order, so equal sets compare equal', () => {
    expect(normaliseCapabilities(['export', 'billing.read'])).toEqual(
      normaliseCapabilities(['billing.read', 'export'])
    );
  });

  it('leaves the built-in roles unchanged (they are already consistent)', () => {
    for (const set of Object.values(ROLE_CAPABILITIES)) {
      expect(new Set(normaliseCapabilities([...set]))).toEqual(set);
    }
  });
});

describe('capabilitiesRequiring', () => {
  it('names what must be unticked together', () => {
    expect(capabilitiesRequiring('billing.read').sort()).toEqual([
      'billing.manage',
      'credits.adjust',
    ]);
    expect(capabilitiesRequiring('clients.read')).toContain('export');
  });
});

describe('roleKeyFromName', () => {
  it('makes a key the database CHECK accepts', () => {
    const accepts = /^[a-z][a-z0-9_]{1,39}$/;
    for (const name of [
      'Finance reviewer',
      '  Ünïcode — Team  ',
      '123 Numbers first',
      'A',
      '日本語',
    ]) {
      expect(roleKeyFromName(name)).toMatch(accepts);
    }
    expect(roleKeyFromName('Finance reviewer')).toBe('finance_reviewer');
  });

  it('never returns a built-in role key', () => {
    expect(roleKeyFromName('Super Admin')).toBe('custom_super_admin');
    expect(roleKeyFromName('billing')).toBe('custom_billing');
  });
});
