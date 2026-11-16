'use server';

import { Prisma } from '@prisma/client';
import { refresh } from 'next/cache';

import { recordAudit } from '@/lib/actions/audit';
import { FieldError, text } from '@/lib/actions/parse';
import type { ActionState } from '@/lib/actions/subscriptions';
import { authorizeAction } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canGrant, getRole } from '@/lib/staff/role-store';
import { normaliseCapabilities, roleKeyFromName } from '@/lib/staff/roles';

/**
 * Roles (Settings → Roles). Needs `staff.manage`.
 *
 * ## What a role stores
 *
 * Capability names, picked as modules in the UI. Every page and Server Action
 * asks `can(staff, capability)` again, so what is saved here is what really
 * gates reads and writes — the menu merely hides what a role cannot use.
 *
 * ## Escalation
 *
 * Nobody but a Super Admin may create or edit a role holding permissions they
 * do not hold themselves (`canGrant`). Otherwise a delegated user manager could
 * build themselves a stronger role and assign it to themselves.
 *
 * ## Editing applies at once
 *
 * `getStaff()` reads a custom role's permissions on every request, so editing a
 * role changes what everyone holding it can do on their next click, without
 * signing them out.
 */

export type RoleActionState = ActionState;

function toState(error: unknown, what: string): RoleActionState {
  if (error instanceof FieldError) return { error: error.message };
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return { error: 'A role with a very similar name already exists.' };
  }
  console.error(`[admin-panel] ${what} failed`, error);
  return { error: 'Could not save that change. Check the logs.' };
}

function readRole(formData: FormData) {
  const name = text(formData, 'name', 'Role name');
  if (name.length < 2 || name.length > 60) {
    throw new FieldError('Role name must be 2 to 60 characters.');
  }
  const rawDescription = formData.get('description');
  const description =
    typeof rawDescription === 'string' ? rawDescription.trim() : '';
  if (description.length > 300) {
    throw new FieldError('Description must be 300 characters or fewer.');
  }
  const capabilities = normaliseCapabilities(formData.getAll('capabilities'));
  return { name, description, capabilities };
}

/** Create a role (no `roleKey`) or update a custom one (`roleKey` present). */
export async function saveRole(
  _previous: RoleActionState,
  formData: FormData
): Promise<RoleActionState> {
  const auth = await authorizeAction('staff.manage');
  if (auth.error) return { error: auth.error };
  const { staff } = auth;

  try {
    const { name, description, capabilities } = readRole(formData);
    const proposed = { capabilities: new Set(capabilities) };

    if (!canGrant(staff, proposed)) {
      throw new FieldError(
        'You can only create a role with permissions you hold yourself.'
      );
    }

    const existingKey = formData.get('roleKey');

    if (typeof existingKey === 'string' && existingKey) {
      const current = await getRole(existingKey);
      if (!current) throw new FieldError('That role no longer exists.');
      if (current.isSystem) {
        throw new FieldError('Built-in roles cannot be edited.');
      }
      if (!canGrant(staff, current)) {
        throw new FieldError(
          'That role holds permissions you do not have, so only a Super Admin can edit it.'
        );
      }

      await prisma.admin_roles.update({
        where: { key: existingKey },
        data: { name, description, capabilities, updated_at: new Date() },
      });
      await recordAudit({
        actor: staff.actor,
        action: 'role.update',
        targetType: 'role',
        targetId: existingKey,
        summary: `Updated role ${name} (${capabilities.length} permissions).`,
        detail: { name, capabilities },
      });
      refresh();
      return {
        ok: `Saved ${name}. People with this role get the change on their next click.`,
      };
    }

    // New role: derive a free key from the name.
    const base = roleKeyFromName(name);
    let key = base;
    for (let n = 2; await prisma.admin_roles.findUnique({ where: { key } }); n++) {
      key = `${base.slice(0, 36)}_${n}`;
    }

    await prisma.admin_roles.create({
      data: {
        key,
        name,
        description,
        capabilities,
        is_system: false,
        created_by: staff.actor,
      },
    });
    await recordAudit({
      actor: staff.actor,
      action: 'role.create',
      targetType: 'role',
      targetId: key,
      summary: `Created role ${name} (${capabilities.length} permissions).`,
      detail: { name, capabilities },
    });
    refresh();
    return { ok: `Created ${name}. You can now give it to a user.` };
  } catch (error) {
    return toState(error, 'role save');
  }
}

export async function deleteRole(
  _previous: RoleActionState,
  formData: FormData
): Promise<RoleActionState> {
  const auth = await authorizeAction('staff.manage');
  if (auth.error) return { error: auth.error };
  const { staff } = auth;

  try {
    const key = formData.get('roleKey');
    if (typeof key !== 'string' || !key) {
      throw new FieldError('Choose a role to delete.');
    }
    const role = await getRole(key);
    if (!role) throw new FieldError('That role no longer exists.');
    if (role.isSystem) {
      throw new FieldError('Built-in roles cannot be deleted.');
    }
    if (!canGrant(staff, role)) {
      throw new FieldError(
        'That role holds permissions you do not have, so only a Super Admin can delete it.'
      );
    }

    const members = await prisma.admin_staff.count({ where: { role: key } });
    if (members > 0) {
      throw new FieldError(
        `${members} ${members === 1 ? 'person holds' : 'people hold'} this role. Move them to another role first.`
      );
    }

    await prisma.admin_roles.delete({ where: { key } });
    await recordAudit({
      actor: staff.actor,
      action: 'role.delete',
      targetType: 'role',
      targetId: key,
      summary: `Deleted role ${role.name}.`,
      detail: { name: role.name },
    });
    refresh();
    return { ok: `Deleted ${role.name}.` };
  } catch (error) {
    return toState(error, 'role delete');
  }
}
