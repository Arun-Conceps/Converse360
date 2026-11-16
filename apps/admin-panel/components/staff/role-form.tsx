'use client';

import { useActionState, useEffect, useState } from 'react';

import { Field, FormMessage, Input, Textarea } from '@/components/ui/form';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  deleteRole,
  saveRole,
  type RoleActionState,
} from '@/lib/actions/roles';
import {
  CAPABILITY_LABEL,
  MODULES,
  capabilitiesRequiring,
  normaliseCapabilities,
  type Capability,
} from '@/lib/staff/roles';

/**
 * Build or edit a role by ticking what it may use, grouped into modules.
 *
 * "View clients" is always on — everybody lands on the Overview, which needs
 * it. Ticking an "edit" permission ticks the "view" it depends on; unticking a
 * "view" unticks what depends on it. The server applies the same rules
 * (`normaliseCapabilities`), so this is a convenience, not the check.
 *
 * `roleKey` present = editing that custom role. Without it, creating one.
 */
export function RoleForm({
  roleKey,
  initialName = '',
  initialDescription = '',
  initialCapabilities = ['clients.read'],
  members = 0,
  onSaved,
}: {
  roleKey?: string;
  initialName?: string;
  initialDescription?: string;
  initialCapabilities?: readonly Capability[];
  members?: number;
  /** Called once after a successful save — a modal uses it to close. */
  onSaved?: () => void;
}) {
  const [state, formAction] = useActionState<RoleActionState, FormData>(
    saveRole,
    {}
  );
  useEffect(() => {
    if (state.ok) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const [removed, removeAction] = useActionState<RoleActionState, FormData>(
    deleteRole,
    {}
  );
  const [selected, setSelected] = useState<Set<Capability>>(
    () => new Set(normaliseCapabilities(initialCapabilities))
  );

  function toggle(capability: Capability, on: boolean) {
    const next = new Set(selected);
    if (on) {
      next.add(capability);
      setSelected(new Set(normaliseCapabilities([...next])));
      return;
    }
    next.delete(capability);
    for (const dependent of capabilitiesRequiring(capability)) {
      next.delete(dependent);
    }
    setSelected(new Set(normaliseCapabilities([...next])));
  }

  function toggleModule(capabilities: readonly Capability[], on: boolean) {
    const next = new Set(selected);
    for (const capability of capabilities) {
      if (capability === 'clients.read') continue;
      if (on) next.add(capability);
      else next.delete(capability);
    }
    setSelected(new Set(normaliseCapabilities([...next])));
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-5">
        {roleKey ? (
          <input type="hidden" name="roleKey" value={roleKey} />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name">
            <Input
              name="name"
              defaultValue={initialName}
              maxLength={60}
              required
              placeholder="e.g. Finance reviewer"
            />
          </Field>
          <Field
            label="Description"
            hint="Optional. Shown when choosing a role."
          >
            <Textarea
              name="description"
              defaultValue={initialDescription}
              maxLength={300}
              rows={1}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <p className="text-ink text-sm font-semibold">
            Modules this role can use
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {MODULES.map((module) => {
              const optional = module.capabilities.filter(
                (c) => c !== 'clients.read'
              );
              const allOn = optional.every((c) => selected.has(c));
              return (
                <fieldset
                  key={module.key}
                  className="border-ring bg-surface rounded-xl border p-4"
                >
                  <legend className="sr-only">{module.label}</legend>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink text-sm font-semibold">
                        {module.label}
                      </p>
                      <p className="text-muted text-xs leading-relaxed">
                        {module.description}
                      </p>
                    </div>
                    {optional.length > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          toggleModule(module.capabilities, !allOn)
                        }
                        className="text-primary shrink-0 text-xs font-semibold hover:underline"
                      >
                        {allOn ? 'Clear' : 'Select all'}
                      </button>
                    ) : null}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {module.capabilities.map((capability) => {
                      const locked = capability === 'clients.read';
                      return (
                        <li key={capability}>
                          <label className="flex items-start gap-2.5 text-sm">
                            <input
                              type="checkbox"
                              name="capabilities"
                              value={capability}
                              checked={selected.has(capability)}
                              disabled={locked}
                              onChange={(event) =>
                                toggle(capability, event.target.checked)
                              }
                              className="accent-primary mt-0.5 size-4 shrink-0"
                            />
                            <span className="text-ink-2">
                              {CAPABILITY_LABEL[capability]}
                              {locked ? (
                                <span className="text-muted block text-[11px]">
                                  Always on — everyone lands on the Overview.
                                </span>
                              ) : null}
                            </span>
                          </label>
                          {/* A disabled checkbox is not submitted. */}
                          {locked ? (
                            <input
                              type="hidden"
                              name="capabilities"
                              value={capability}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              );
            })}
          </div>
        </div>

        <FormMessage ok={state.ok} error={state.error} />
        <SubmitButton pendingLabel="Saving…">
          {roleKey ? 'Save changes' : 'Create role'}
        </SubmitButton>
      </form>

      {roleKey ? (
        <form
          action={removeAction}
          className="border-line flex flex-wrap items-center gap-3 border-t pt-4"
        >
          <input type="hidden" name="roleKey" value={roleKey} />
          <SubmitButton variant="danger" pendingLabel="Deleting…">
            Delete role
          </SubmitButton>
          <span className="text-muted text-xs">
            {members > 0
              ? `${members} ${members === 1 ? 'person holds' : 'people hold'} this role — move them first.`
              : 'Nobody holds this role.'}
          </span>
          <FormMessage ok={removed.ok} error={removed.error} />
        </form>
      ) : null}
    </div>
  );
}
