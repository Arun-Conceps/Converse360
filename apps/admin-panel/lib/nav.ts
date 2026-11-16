import type { Capability } from '@/lib/staff/roles';

/**
 * The Control Center's navigation — one list, read by the server (to filter
 * by capability) and by the client rail (to render and highlight).
 *
 * Main menus with sub-menus, grouped by what the operator came to do: run
 * today's operations, look after clients, watch channel and integration
 * health, manage revenue, then configure the panel itself (Settings: users,
 * roles, thresholds, the AI catalog, the audit log). `single` groups are a
 * plain top-level link. Every href is a stable route — never an index — so a
 * deep link, a refresh and back/forward all land on the same screen.
 *
 * `icon` is a name resolved in the client rail, because a component cannot
 * cross the server → client boundary as a prop. Each GROUP has an icon; its
 * sub-menu items are text-only so the rail stays quiet when a menu is open.
 */

export type NavIcon =
  'overview' | 'operations' | 'clients' | 'monitoring' | 'revenue' | 'settings';

export type NavItem = {
  href: string;
  label: string;
  capability: Capability;
};

export type NavGroup = {
  /** Stable key — used to remember which menu is open. */
  key: string;
  label: string;
  /** Small heading above the first group of each section in the rail. */
  section: string;
  icon: NavIcon;
  /** A one-item group rendered as a direct link, not an expandable menu. */
  single?: boolean;
  items: NavItem[];
};

export const NAV: NavGroup[] = [
  {
    key: 'overview',
    section: 'Main',
    label: 'Dashboard',
    icon: 'overview',
    single: true,
    items: [{ href: '/', label: 'Dashboard', capability: 'clients.read' }],
  },
  {
    key: 'operations',
    section: 'Main',
    label: 'Operations',
    icon: 'operations',
    items: [
      { href: '/incidents', label: 'Incidents', capability: 'clients.read' },
      {
        href: '/support',
        label: 'Support Tickets',
        capability: 'tickets.work',
      },
      { href: '/onboarding', label: 'Onboarding', capability: 'clients.read' },
    ],
  },
  {
    key: 'clients',
    section: 'Main',
    label: 'Clients',
    icon: 'clients',
    items: [
      { href: '/clients', label: 'All Clients', capability: 'clients.read' },
      { href: '/users', label: 'Client Users', capability: 'clients.read' },
      { href: '/portfolio', label: 'Analytics', capability: 'clients.read' },
    ],
  },
  {
    key: 'monitoring',
    section: 'Insights',
    label: 'Monitoring',
    icon: 'monitoring',
    items: [
      { href: '/health', label: 'Channel Health', capability: 'clients.read' },
      {
        href: '/integrations',
        label: 'Integrations & API',
        capability: 'integrations.read',
      },
    ],
  },
  {
    key: 'revenue',
    section: 'Insights',
    label: 'Revenue',
    icon: 'revenue',
    items: [
      {
        href: '/subscriptions',
        label: 'Subscriptions',
        capability: 'billing.read',
      },
      { href: '/plans', label: 'Plans & Pricing', capability: 'billing.read' },
      { href: '/credits', label: 'AI Credits', capability: 'billing.read' },
    ],
  },
  {
    key: 'settings',
    section: 'Administration',
    label: 'Settings',
    icon: 'settings',
    items: [
      { href: '/staff', label: 'Users', capability: 'staff.manage' },
      { href: '/roles', label: 'Roles', capability: 'staff.manage' },
      { href: '/settings', label: 'General', capability: 'settings.manage' },
      { href: '/catalog', label: 'AI Catalog', capability: 'clients.read' },
      { href: '/audit', label: 'Audit Log', capability: 'audit.read' },
    ],
  },
];

/** Is this pathname inside the section that `href` names? */
export function isActive(pathname: string, href: string): boolean {
  return href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Which section owns a pathname — for the top bar's title. */
export function sectionFor(pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const group of NAV) {
    for (const item of group.items) {
      if (
        isActive(pathname, item.href) &&
        (!best || item.href.length > best.href.length)
      ) {
        best = item;
      }
    }
  }
  return best;
}
