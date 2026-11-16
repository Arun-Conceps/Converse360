import { Check } from 'lucide-react';
import type { Metadata } from 'next';

import { NewRoleButton } from '@/components/staff/new-role-button';
import { RoleForm } from '@/components/staff/role-form';
import { Pill } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { ButtonLink, PageHeader } from '@/components/ui/page';
import { requireCapability } from '@/lib/auth';
import { canGrant, listRoles } from '@/lib/staff/role-store';
import { ALL_CAPABILITIES, CAPABILITY_LABEL, MODULES } from '@/lib/staff/roles';

export const metadata: Metadata = {
  title: 'Roles · Converse360 Control Center',
};

/**
 * Roles — build a role by choosing the modules it may use, then give it to a
 * user on the Users page. Needs `staff.manage`. The six built-in roles are
 * shown read-only; custom roles can be edited or deleted (when nobody holds
 * them).
 */
export default async function RolesPage() {
  const me = await requireCapability('staff.manage');
  const roles = await listRoles();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Roles"
        description="Choose which modules a role can use, then give the role to a user."
        actions={
          <>
            <ButtonLink href="/staff" variant="secondary">
              Go to users
            </ButtonLink>
            <NewRoleButton />
          </>
        }
      />

      <Card>
        <CardHeader
          title="All roles"
          description={`${roles.length} roles. Open one to see or change what it can do.`}
        />
        <ul className="divide-line divide-y">
          {roles.map((role) => {
            const count = ALL_CAPABILITIES.filter((c) =>
              role.capabilities.has(c)
            ).length;
            const editable = !role.isSystem && canGrant(me, role);
            return (
              <li key={role.key}>
                <details className="group">
                  <summary className="hover:bg-surface-2 flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block text-sm font-semibold">
                        {role.name}
                      </span>
                      <span className="text-muted block truncate text-xs">
                        {role.description || 'No description'}
                      </span>
                    </span>
                    <Pill tone={role.isSystem ? 'neutral' : 'primary'}>
                      {role.isSystem ? 'Built-in' : 'Custom'}
                    </Pill>
                    <span className="text-muted hidden w-28 text-right text-xs sm:block">
                      {count} permissions
                    </span>
                    <span className="text-muted w-20 text-right text-xs">
                      {role.members} {role.members === 1 ? 'user' : 'users'}
                    </span>
                  </summary>

                  <div className="border-line bg-surface-2/50 border-t px-5 py-4">
                    {editable ? (
                      <RoleForm
                        roleKey={role.key}
                        initialName={role.name}
                        initialDescription={role.description}
                        initialCapabilities={ALL_CAPABILITIES.filter((c) =>
                          role.capabilities.has(c)
                        )}
                        members={role.members}
                      />
                    ) : (
                      <div className="space-y-3">
                        {role.isSystem ? null : (
                          <p className="text-muted text-xs">
                            This role holds permissions you do not have, so only
                            a Super Admin can edit it.
                          </p>
                        )}
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {MODULES.map((module) => {
                            const has = module.capabilities.filter((c) =>
                              role.capabilities.has(c)
                            );
                            return (
                              <div key={module.key}>
                                <p className="text-ink text-sm font-semibold">
                                  {module.label}
                                </p>
                                {has.length === 0 ? (
                                  <p className="text-muted mt-1 text-xs">
                                    No access
                                  </p>
                                ) : (
                                  <ul className="mt-1 space-y-1">
                                    {has.map((c) => (
                                      <li
                                        key={c}
                                        className="text-ink-2 flex items-start gap-1.5 text-xs"
                                      >
                                        <Check
                                          aria-hidden
                                          className="text-good-fg mt-0.5 size-3.5 shrink-0"
                                        />
                                        {CAPABILITY_LABEL[c]}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
