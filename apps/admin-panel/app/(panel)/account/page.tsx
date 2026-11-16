import { Check } from 'lucide-react';
import type { Metadata } from 'next';

import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Facts } from '@/components/ui/facts';
import { PageHeader } from '@/components/ui/page';
import { requireStaff } from '@/lib/auth';
import { formatAgo, formatDate, formatDateTime } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/staff/role-store';
import { CAPABILITY_LABEL, MODULES } from '@/lib/staff/roles';

export const metadata: Metadata = {
  title: 'Profile · Converse360 Control Center',
};

/**
 * Your profile: who you are signed in as, what your role lets you do, and
 * changing your password. Open to every signed-in staff member; the
 * break-glass login has no stored password or history and is told so.
 */
export default async function AccountPage() {
  const staff = await requireStaff();

  const [row, role] = await Promise.all([
    staff.id
      ? prisma.admin_staff.findUnique({
          where: { id: staff.id },
          select: { created_at: true, last_login_at: true },
        })
      : Promise.resolve(null),
    getRole(staff.role),
  ]);

  const granted = MODULES.map((module) => ({
    module,
    has: module.capabilities.filter((c) => staff.capabilities.has(c)),
  })).filter((entry) => entry.has.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile" description="Your details and what your role can do." />

      <Card>
        <CardHeader title="Profile details" />
        <CardBody>
          <Facts
            items={[
              { label: 'Name', value: staff.name },
              { label: 'Email', value: staff.email },
              {
                label: 'Role',
                value: staff.roleLabel,
                hint: role?.description || undefined,
              },
              ...(row
                ? [
                    {
                      label: 'Member since',
                      value: formatDate(row.created_at),
                    },
                    {
                      label: 'Last sign-in',
                      value: row.last_login_at
                        ? formatAgo(row.last_login_at)
                        : 'This is your first',
                    },
                  ]
                : []),
              {
                label: 'This session ends',
                value: formatDateTime(new Date(staff.sessionExpiresAt * 1000)),
              },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What your role can do"
          description="Set by a Super Admin in Settings → Roles."
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            {granted.map(({ module, has }) => (
              <div key={module.key}>
                <p className="text-ink text-sm font-semibold">{module.label}</p>
                <ul className="mt-1 space-y-1">
                  {has.map((capability) => (
                    <li
                      key={capability}
                      className="text-ink-2 flex items-start gap-1.5 text-xs"
                    >
                      <Check
                        aria-hidden
                        className="text-good-fg mt-0.5 size-3.5 shrink-0"
                      />
                      {CAPABILITY_LABEL[capability]}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
