import { Bell } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { MobileNav } from '@/components/shell/mobile-nav';
import { GlobalSearch } from '@/components/shell/global-search';
import { Nav } from '@/components/shell/nav';
import { ProfileMenu } from '@/components/shell/profile-menu';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { logout } from '@/lib/actions/auth';
import { can, requireStaff } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { NAV } from '@/lib/nav';
import { prisma } from '@/lib/prisma';

/**
 * The authenticated shell: a left sidebar with main menus that open into
 * sub-menus, a slim top bar (client search, theme toggle, the signed-in staff
 * member) and the page. Below `lg` the sidebar becomes a drawer.
 *
 * `requireStaff()` here protects the render and nothing else — each page and
 * every Server Action checks its own capability again.
 */
export default async function PanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const staff = await requireStaff();

  const allowed = NAV.flatMap((group) => group.items)
    .filter((item) => can(staff, item.capability))
    .map((item) => item.href);

  // Pages the search box can jump to: the menu this person may open, plus
  // their own account screens.
  const searchPages = [
    ...NAV.flatMap((group) =>
      group.items
        .filter((item) => can(staff, item.capability))
        .map((item) => ({
          href: item.href,
          label: item.label,
          group: group.label,
        }))
    ),
    { href: '/account', label: 'Profile', group: 'Account' },
    { href: '/account/password', label: 'Change password', group: 'Account' },
  ];

  // One cheap, indexed count for the menu: open tickets nobody owns. The
  // fleet health scan is deliberately NOT run here — it would cost every
  // page load a pass over every workspace.
  const unassigned = can(staff, 'tickets.work')
    ? await prisma.support_tickets.count({
        where: {
          assignee_staff_id: null,
          status: { notIn: ['resolved', 'closed'] },
        },
      })
    : 0;

  const brand = (
    <Link
      href="/"
      className="flex items-center gap-2 px-1"
      aria-label="Converse360 admin"
    >
      <Image
        src="/brand/converse360-wordmark.svg"
        alt=""
        width={768}
        height={120}
        unoptimized
        className="h-5 w-auto [html[data-mode=dark]_&]:hidden"
      />
      <Image
        src="/brand/converse360-wordmark-dark.svg"
        alt=""
        width={768}
        height={120}
        unoptimized
        className="hidden h-5 w-auto [html[data-mode=dark]_&]:block"
      />
    </Link>
  );

  const badges = { '/support': unassigned };

  return (
    <div className="min-h-dvh lg:pl-[256px]">
      <aside className="rail bg-rail border-line fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col border-r lg:flex">
        <div className="px-5 pt-5 pb-4">{brand}</div>
        <div className="rail-scroll flex-1 overflow-y-auto px-3 pb-4">
          <Nav allowed={allowed} badges={badges} />
        </div>
        <div className="border-line border-t p-3">
          <ProfileMenu
            variant="rail"
            name={staff.name}
            email={staff.email}
            roleLabel={staff.roleLabel}
            initials={initialsOf(staff.name, staff.email)}
            isBreakGlass={staff.isBreakGlass}
            signOut={logout}
          />
          <p className="text-rail-muted mt-2 text-center text-[10.5px]">
            Converse360 Control Center
          </p>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="border-line bg-surface/90 sticky top-0 z-20 border-b backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center gap-3 px-4 lg:px-8">
            <MobileNav brand={brand}>
              <Nav allowed={allowed} badges={badges} />
            </MobileNav>

            <GlobalSearch pages={searchPages} />

            <div className="ml-auto flex items-center gap-1.5">
              {allowed.includes('/support') ? (
                <Link
                  href="/support"
                  aria-label={
                    unassigned > 0
                      ? `${unassigned} unassigned support tickets`
                      : 'Support tickets'
                  }
                  className="text-ink-2 hover:bg-surface-2 hover:text-ink relative grid size-9 place-items-center rounded-lg transition-colors"
                >
                  <Bell aria-hidden className="size-[18px]" />
                  {unassigned > 0 ? (
                    <span className="bg-critical absolute -top-0.5 -right-0.5 rounded-full px-1 text-[10px] leading-4 font-bold text-white">
                      {unassigned > 99 ? '99+' : unassigned}
                    </span>
                  ) : null}
                </Link>
              ) : null}
              <ThemeToggle />
              <div>
                <ProfileMenu
                  name={staff.name}
                  email={staff.email}
                  roleLabel={staff.roleLabel}
                  initials={initialsOf(staff.name, staff.email)}
                  isBreakGlass={staff.isBreakGlass}
                  signOut={logout}
                />
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
