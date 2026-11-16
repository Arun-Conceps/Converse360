'use client';

import { useActionState, useState } from 'react';

import { SecretReveal } from '@/components/staff/secret-reveal';
import { Field, FormMessage, Input, Select } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/submit-button';
import { createStaff, type StaffActionState } from '@/lib/actions/staff';

export type RoleOption = { key: string; name: string; description: string };

/**
 * Add a user. The role is chosen from the roles built in Settings → Roles,
 * and its description is shown so the choice is informed. No password field:
 * one is generated and shown once, because a typed one is how `Welcome123`
 * reaches production.
 */
export function CreateStaff({ roles }: { roles: RoleOption[] }) {
  const [state, formAction] = useActionState<StaffActionState, FormData>(
    createStaff,
    {}
  );
  const [roleKey, setRoleKey] = useState(
    roles.find((r) => r.key === 'support_l1')?.key ?? roles[0]?.key ?? ''
  );
  const selected = roles.find((r) => r.key === roleKey);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Work email">
            <Input
              type="email"
              name="email"
              autoComplete="off"
              spellCheck={false}
              maxLength={254}
              required
            />
          </Field>
          <Field label="Full name">
            <Input name="fullName" autoComplete="off" maxLength={80} required />
          </Field>
        </div>
        <Field
          label="Role"
          hint={
            selected?.description ||
            'Roles decide which modules this person can open.'
          }
        >
          <Select
            name="role"
            value={roleKey}
            onChange={(event) => setRoleKey(event.target.value)}
          >
            {roles.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name}
              </option>
            ))}
          </Select>
        </Field>
        <FormMessage ok={state.ok} error={state.error} />
        <SubmitButton pendingLabel="Creating…">Create user</SubmitButton>
      </form>
      {state.secret ? (
        <SecretReveal secret={state.secret} owner={state.secretFor} />
      ) : null}
    </div>
  );
}
