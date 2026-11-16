import { KeyRound, ShieldCheck, Users } from 'lucide-react';
import type { Metadata } from 'next';

import { NewStaffButton } from '@/components/staff/new-staff-button';
import { StaffActions } from '@/components/staff/staff-actions';
import { Pill } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ButtonLink, Callout, PageHeader } from '@/components/ui/page';
import { StatRow, StatTile } from '@/components/ui/stat';
import {
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui/table';
import { requireCapability } from '@/lib/auth';
import { formatAgo, formatDate, formatNumber, initialsOf } from '@/lib/format';
import { listStaff } from '@/lib/queries/staff';
import { canGrant, listRoles, roleName } from '@/lib/staff/role-store';

export const metadata: Metadata = {
  title: 'Users · Converse360 Control Center',
};

/**
 * Users — who can sign in to the Control Center, and with which role. Needs
 * `staff.manage`: the page itself and every action behind it. Roles are built
 * on their own page (Settings → Roles) and chosen here.
 */
export default async function UsersPage() {
  const me = await requireCapability('staff.manage');
  const [staff, roles] = await Promise.all([listStaff(), listRoles()]);

  // Only offer roles this person may actually give; the action checks again.
  const grantable = roles
    .filter((role) => canGrant(me, role))
    .map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
    }));

  const active = staff.filter((s) => s.isActive);
  const superAdmins = active.filter((s) => s.role === 'super_admin').length;
  const neverSignedIn = active.filter((s) => !s.lastLoginAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Users"
        description="Who can sign in, and with which role."
        actions={
          <>
            <ButtonLink href="/roles" variant="secondary">
              Manage roles
            </ButtonLink>
            <NewStaffButton roles={grantable} />
          </>
        }
      />

      <StatRow columns={3}>
        <StatTile
          label="Active users"
          value={formatNumber(active.length)}
          icon={Users}
          context={`${formatNumber(staff.length - active.length)} deactivated`}
        />
        <StatTile
          label="Super Admins"
          value={formatNumber(superAdmins)}
          icon={ShieldCheck}
          context={
            superAdmins === 0
              ? 'None yet'
              : superAdmins === 1
                ? 'Consider a second'
                : 'Can manage everything'
          }
          tone={
            superAdmins === 0
              ? 'critical'
              : superAdmins === 1
                ? 'warning'
                : 'neutral'
          }
        />
        <StatTile
          label="Never signed in"
          value={formatNumber(neverSignedIn)}
          icon={KeyRound}
          context="Still on a temporary password"
          tone={neverSignedIn > 0 ? 'warning' : 'neutral'}
        />
      </StatRow>

      {me.isBreakGlass ? (
        <Callout
          tone="warn"
          title="You are signed in with the break-glass login"
        >
          Add your own user (top right) and use that day to day. Once two Super
          Admins exist, unset <code>ADMIN_USERNAME</code> and{' '}
          <code>ADMIN_PASSWORD</code>.
        </Callout>
      ) : null}

      <div>
        <Card>
          <CardHeader
            title="All users"
            description="Deactivating keeps the person's name on everything they touched."
          />
          {staff.length === 0 ? (
            <EmptyState title="No users yet">
              Everyone is signing in with the break-glass login. Use Add user at
              the top right to create the first one.
            </EmptyState>
          ) : (
            <TableWrap>
              <Table minWidth="48rem">
                <THead>
                  <TR>
                    <TH>Person</TH>
                    <TH>Role</TH>
                    <TH>Last sign-in</TH>
                    <TH align="right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {staff.map((person) => (
                    <TR key={person.id}>
                      <TD>
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            aria-hidden
                            className="bg-primary-soft text-primary-soft-ink grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold"
                          >
                            {initialsOf(person.name, person.email)}
                          </span>
                          <span className="min-w-0">
                            <span className="text-ink block truncate font-semibold">
                              {person.name}
                              {person.id === me.id ? (
                                <span className="text-muted font-normal">
                                  {' '}
                                  (you)
                                </span>
                              ) : null}
                            </span>
                            <span className="text-muted block truncate text-xs">
                              {person.email}
                            </span>
                          </span>
                        </div>
                      </TD>
                      <TD>
                        <span className="flex flex-col items-start gap-1">
                          <Pill
                            tone={
                              person.role === 'super_admin'
                                ? 'primary'
                                : 'neutral'
                            }
                          >
                            {roleName(person.role, roles)}
                          </Pill>
                          {person.isActive ? null : (
                            <Pill tone="bad" glyph="■">
                              Deactivated
                            </Pill>
                          )}
                        </span>
                      </TD>
                      <TD>
                        <span className="text-ink-2">
                          {person.lastLoginAt
                            ? formatAgo(person.lastLoginAt)
                            : 'Never'}
                        </span>
                        <span className="text-muted block text-xs">
                          added {formatDate(person.createdAt)}
                          {person.createdBy ? ` by ${person.createdBy}` : ''}
                        </span>
                      </TD>
                      <TD align="right">
                        <StaffActions
                          staffId={person.id}
                          role={person.role}
                          roles={grantable}
                          isActive={person.isActive}
                          isSelf={person.id === me.id}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  );
}
