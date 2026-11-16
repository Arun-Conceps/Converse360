/**
 * Staff roles and what each may do — the ONE permission table.
 *
 * The nav hides what a role cannot use, every page asks
 * `requireCapability()` before it reads, and every Server Action asks again
 * before it writes. All three read this map, so they cannot disagree. Hiding
 * a link is a courtesy; the page and action checks are the boundary (a
 * Server Action is reachable by direct POST whatever the nav showed).
 *
 * Pure and secret-free on purpose, so client components may import it for
 * labels.
 *
 * Roles follow the C2.0 handoff: L1 reads basic health and onboarding; L2
 * makes approved safe configuration changes; L3 adds API/webhook
 * diagnostics; Super Admin governs staff, model mapping and settings. Account
 * managers own client relationships; billing owns money. NO role can reveal
 * a plaintext secret — there is no capability for that because no screen
 * reads one.
 */

export const STAFF_ROLES = [
  'super_admin',
  'account_manager',
  'billing',
  'support_l1',
  'support_l2',
  'support_l3',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super Admin',
  account_manager: 'Account Manager',
  billing: 'Billing',
  support_l1: 'Support L1',
  support_l2: 'Support L2',
  support_l3: 'Support L3',
};

export const ROLE_SUMMARY: Record<StaffRole, string> = {
  super_admin:
    'Everything, including staff accounts, the AI catalog mapping and settings.',
  account_manager:
    'Owns client relationships: assignment, lifecycle, notes, tasks, tickets and safe workspace changes. Reads billing.',
  billing:
    'Subscriptions, plans, renewals and AI credit adjustments. Works billing tickets.',
  support_l1:
    'Reads onboarding, health and client records; works tickets. No billing figures.',
  support_l2:
    'L1, plus safe configuration changes on a workspace (membership, invitations, settings).',
  support_l3:
    'L2, plus API keys, webhooks and integration diagnostics, and the internal model mapping.',
};

export type Capability =
  /** See the client directory, Customer 360, health, onboarding. */
  | 'clients.read'
  /** Assign owners, pin lifecycle, set tier/tags. */
  | 'clients.manage'
  /** Write notes and tasks on a client. */
  | 'clients.notes'
  /** Membership, invitations, workspace name/country/currency. */
  | 'members.manage'
  /** See money: MRR, prices, subscriptions, invoices, credit revenue. */
  | 'billing.read'
  /** Edit subscriptions, plans and credit pack prices. */
  | 'billing.manage'
  /** Move AI credits through admin_adjust_ai_credits. */
  | 'credits.adjust'
  /** See and work the support desk. */
  | 'tickets.work'
  /** API keys, webhook endpoints, integration diagnostics. */
  | 'integrations.read'
  /** See the provider/model behind each Converse alias. */
  | 'catalog.read_mapping'
  /** Edit the AI catalog. */
  | 'catalog.manage'
  /** Create, deactivate and re-role staff. */
  | 'staff.manage'
  /** The full cross-tenant audit log. */
  | 'audit.read'
  /** SLA targets, watch windows, thresholds. */
  | 'settings.manage'
  /** CSV exports of client and portfolio data. */
  | 'export';

const ALL: Capability[] = [
  'clients.read',
  'clients.manage',
  'clients.notes',
  'members.manage',
  'billing.read',
  'billing.manage',
  'credits.adjust',
  'tickets.work',
  'integrations.read',
  'catalog.read_mapping',
  'catalog.manage',
  'staff.manage',
  'audit.read',
  'settings.manage',
  'export',
];

const SUPPORT_BASE: Capability[] = [
  'clients.read',
  'clients.notes',
  'tickets.work',
];

export const ROLE_CAPABILITIES: Record<StaffRole, ReadonlySet<Capability>> = {
  super_admin: new Set(ALL),
  account_manager: new Set<Capability>([
    'clients.read',
    'clients.manage',
    'clients.notes',
    'members.manage',
    'billing.read',
    'tickets.work',
    'audit.read',
    'export',
  ]),
  billing: new Set<Capability>([
    'clients.read',
    'clients.notes',
    'billing.read',
    'billing.manage',
    'credits.adjust',
    'tickets.work',
    'audit.read',
    'export',
  ]),
  support_l1: new Set<Capability>(SUPPORT_BASE),
  support_l2: new Set<Capability>([
    ...SUPPORT_BASE,
    'members.manage',
    'billing.read',
  ]),
  support_l3: new Set<Capability>([
    ...SUPPORT_BASE,
    'members.manage',
    'billing.read',
    'integrations.read',
    'catalog.read_mapping',
    'audit.read',
  ]),
};

export function isStaffRole(value: unknown): value is StaffRole {
  return (
    typeof value === 'string' &&
    (STAFF_ROLES as readonly string[]).includes(value)
  );
}

export function roleCan(role: StaffRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/* ============================================================
 * Custom roles (migration 101).
 *
 * A Super Admin builds a role by ticking permissions, grouped into modules.
 * The six built-in roles above stay defined in code; a custom role stores the
 * capability names it was given and nothing else.
 * ============================================================ */

/** Every capability, in one stable order. */
export const ALL_CAPABILITIES: readonly Capability[] = ALL;

export function isCapability(value: unknown): value is Capability {
  return (
    typeof value === 'string' && (ALL as readonly string[]).includes(value)
  );
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  'clients.read': 'View clients, health and onboarding',
  'clients.notes': 'Write notes and tasks on a client',
  'clients.manage': 'Assign owners, lifecycle and service tier',
  'members.manage': 'Manage workspace members and invitations',
  export: 'Export client and portfolio data (CSV)',
  'tickets.work': 'View and work support tickets',
  'billing.read': 'See subscriptions, plans and revenue',
  'billing.manage': 'Edit subscriptions, plans and credit packs',
  'credits.adjust': 'Adjust AI credits',
  'integrations.read': 'See API keys, webhooks and integration diagnostics',
  'catalog.read_mapping': 'See which model sits behind each AI alias',
  'catalog.manage': 'Edit the AI catalog',
  'staff.manage': 'Create users and roles',
  'settings.manage': 'Change SLA targets and thresholds',
  'audit.read': 'Read the audit log',
};

export type ModuleDef = {
  key: string;
  label: string;
  description: string;
  capabilities: readonly Capability[];
};

/** The modules shown when building a role. Every capability appears once. */
export const MODULES: readonly ModuleDef[] = [
  {
    key: 'clients',
    label: 'Clients',
    description: 'The client directory, Customer 360, health and onboarding.',
    capabilities: [
      'clients.read',
      'clients.notes',
      'clients.manage',
      'members.manage',
      'export',
    ],
  },
  {
    key: 'support',
    label: 'Support desk',
    description: 'Tickets, SLAs and the support queue.',
    capabilities: ['tickets.work'],
  },
  {
    key: 'billing',
    label: 'Billing & revenue',
    description: 'Subscriptions, plans, renewals and AI credits.',
    capabilities: ['billing.read', 'billing.manage', 'credits.adjust'],
  },
  {
    key: 'integrations',
    label: 'Integrations & API',
    description: 'API keys, webhooks and store or Google connections.',
    capabilities: ['integrations.read'],
  },
  {
    key: 'catalog',
    label: 'AI catalog',
    description: 'The Converse AI models and their internal mapping.',
    capabilities: ['catalog.read_mapping', 'catalog.manage'],
  },
  {
    key: 'settings',
    label: 'Settings & access',
    description: 'Users, roles, thresholds and the audit log.',
    capabilities: ['staff.manage', 'settings.manage', 'audit.read'],
  },
];

/** Permissions that only make sense together with another. */
const IMPLIES: Partial<Record<Capability, readonly Capability[]>> = {
  'clients.notes': ['clients.read'],
  'clients.manage': ['clients.read'],
  'members.manage': ['clients.read'],
  export: ['clients.read'],
  'billing.manage': ['billing.read'],
  'credits.adjust': ['billing.read'],
  'catalog.manage': ['catalog.read_mapping'],
};

/**
 * Turns whatever was submitted into a valid capability list: unknown names
 * dropped, implied ones added ("edit billing" brings "see billing"), and
 * `clients.read` always present — every staff member lands on the Overview,
 * which needs it, so a role without it would sign people into a no-access page.
 * Returned in the stable ALL order, so equal sets compare equal.
 */
export function normaliseCapabilities(input: readonly unknown[]): Capability[] {
  const set = new Set<Capability>(['clients.read']);
  for (const value of input) {
    if (!isCapability(value)) continue;
    set.add(value);
    for (const needed of IMPLIES[value] ?? []) set.add(needed);
  }
  return ALL.filter((capability) => set.has(capability));
}

/** Every capability that needs `capability` — unticking it must untick these. */
export function capabilitiesRequiring(capability: Capability): Capability[] {
  return ALL.filter((other) => IMPLIES[other]?.includes(capability));
}

/** A role key for a custom role, from its name. Never one of the built-ins. */
export function roleKeyFromName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  const key = /^[a-z]/.test(base) && base.length >= 2 ? base : `role_${base}`;
  return isStaffRole(key) ? `custom_${key}` : key;
}
