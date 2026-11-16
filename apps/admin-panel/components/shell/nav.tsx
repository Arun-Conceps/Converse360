'use client';

import {
  Activity,
  BarChart3,
  Building2,
  ChevronDown,
  Coins,
  CreditCard,
  FileClock,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  Plug,
  Radar,
  Rocket,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { isActive, NAV, type NavIcon } from '@/lib/nav';

/**
 * The rail's menu: main menus that open into sub-menus. Client-side only
 * because it needs `usePathname` to mark the current page and to open the menu
 * that holds it; which items appear is decided on the server (`allowed`) from
 * the staff member's capabilities, so a role never sees a link to a screen
 * that would refuse them. A menu with no allowed items disappears entirely.
 */

const ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  operations: Activity,
  clients: Building2,
  monitoring: Radar,
  revenue: Wallet,
  settings: Settings,
};

/** Icons for sub-menu items, by route. */
const ITEM_ICONS: Record<string, LucideIcon> = {
  '/incidents': ShieldAlert,
  '/support': LifeBuoy,
  '/onboarding': Rocket,
  '/clients': Building2,
  '/users': Users,
  '/portfolio': BarChart3,
  '/health': HeartPulse,
  '/integrations': Plug,
  '/subscriptions': CreditCard,
  '/plans': Tag,
  '/credits': Coins,
  '/staff': UserCog,
  '/roles': ShieldCheck,
  '/settings': SlidersHorizontal,
  '/catalog': Sparkles,
  '/audit': FileClock,
};

function Badge({ count }: { count: number }) {
  return (
    <span className="bg-critical tabular rounded-full px-1.5 text-[10px] leading-4 font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Nav({
  allowed,
  badges = {},
  onNavigate,
}: {
  allowed: string[];
  /** Small counts beside a link — open incidents, unassigned tickets. */
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const allow = new Set(allowed);

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => allow.has(item.href)),
  })).filter((group) => group.items.length > 0);

  const activeKey = groups.find((group) =>
    group.items.some((item) => isActive(pathname, item.href))
  )?.key;

  // An accordion: at most one menu is open. Opening another closes this one.
  const [openKey, setOpenKey] = useState<string | null>(activeKey ?? null);

  // Landing on a page opens the menu that holds it (and closes the rest) —
  // React's "adjust state when a value changes" pattern (set during render,
  // guarded), not an effect, so the right menu is already open on the first
  // paint after navigation. Pages outside any menu leave the choice alone.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (activeKey && openKey !== activeKey) setOpenKey(activeKey);
  }

  function toggle(key: string) {
    setOpenKey(openKey === key ? null : key);
  }

  return (
    <nav aria-label="Main menu" className="space-y-0.5">
      {groups.map((group, index) => {
        const Icon = ICONS[group.icon];
        const heading =
          index === 0 || groups[index - 1].section !== group.section ? (
            <p
              className={`text-rail-muted px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] uppercase ${
                index === 0 ? 'pt-1' : 'pt-5'
              }`}
            >
              {group.section}
            </p>
          ) : null;
        const hasActive = group.items.some((item) =>
          isActive(pathname, item.href)
        );

        const head = `relative flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] font-semibold transition-colors`;
        const headColor = hasActive
          ? 'text-primary-soft-ink before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary'
          : 'text-rail-ink-strong hover:bg-rail-2';
        const iconColor = hasActive ? 'text-primary' : 'text-rail-muted';

        // A one-item group is a plain top-level link.
        if (group.single) {
          const item = group.items[0];
          return (
            <div key={group.key}>
              {heading}
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={hasActive ? 'page' : undefined}
                className={`${head} ${
                  hasActive
                    ? 'bg-rail-active text-primary-soft-ink before:bg-primary before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full'
                    : headColor
                }`}
              >
                <Icon
                  aria-hidden
                  className={`size-[18px] shrink-0 ${iconColor}`}
                  strokeWidth={1.9}
                />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
              </Link>
            </div>
          );
        }

        const isOpen = openKey === group.key;
        const rolledUp = group.items.reduce(
          (sum, item) => sum + (badges[item.href] ?? 0),
          0
        );

        return (
          <div key={group.key}>
            {heading}
            <button
              type="button"
              onClick={() => toggle(group.key)}
              aria-expanded={isOpen}
              aria-controls={`nav-${group.key}`}
              className={`${head} ${headColor}`}
            >
              <Icon
                aria-hidden
                className={`size-[18px] shrink-0 ${iconColor}`}
                strokeWidth={1.9}
              />
              <span className="min-w-0 flex-1 truncate">{group.label}</span>
              {/* A closed menu still says something inside needs a person. */}
              {!isOpen && rolledUp > 0 ? <Badge count={rolledUp} /> : null}
              <ChevronDown
                aria-hidden
                className={`text-rail-muted size-4 shrink-0 transition-transform ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Always rendered so the height can animate: a grid row that goes
                0fr -> 1fr slides the list open without measuring it. While
                closed it is `inert`, so its links leave the tab order and the
                accessibility tree. */}
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <ul
                  id={`nav-${group.key}`}
                  inert={!isOpen}
                  className={`border-line mt-0.5 mb-1.5 ml-[21px] space-y-0.5 border-l pl-2.5 transition-opacity duration-200 motion-reduce:transition-none ${
                    isOpen ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    const badge = badges[item.href];
                    const ItemIcon = ITEM_ICONS[item.href];
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={`flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                            active
                              ? 'bg-rail-active text-primary-soft-ink font-semibold'
                              : 'text-rail-ink hover:bg-rail-2 hover:text-rail-ink-strong font-medium'
                          }`}
                        >
                          {ItemIcon ? (
                            <ItemIcon
                              aria-hidden
                              className={`size-4 shrink-0 ${
                                active ? 'text-primary' : 'text-rail-muted'
                              }`}
                              strokeWidth={1.8}
                            />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>
                          {badge ? <Badge count={badge} /> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
