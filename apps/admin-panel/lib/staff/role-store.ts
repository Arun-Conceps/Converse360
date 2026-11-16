import 'server-only';

import { cache } from 'react';

import { prisma } from '@/lib/prisma';
import {
  ROLE_CAPABILITIES,
  ROLE_LABEL,
  ROLE_SUMMARY,
  STAFF_ROLES,
  isStaffRole,
  normaliseCapabilities,
  type Capability,
} from '@/lib/staff/roles';

/**
 * Roles as the panel uses them: the six built-ins (defined in code, so they
 * keep working even if the table is unreachable) and the custom roles a Super
 * Admin created (migration 101).
 *
 * A custom role's stored capability names are passed through
 * `normaliseCapabilities` on every load, so a stale or hand-edited value can
 * never grant something the code has no capability for, and `clients.read` is
 * always present.
 */

export type RoleDef = {
  key: string;
  name: string;
  description: string;
  capabilities: ReadonlySet<Capability>;
  /** One of the six built-ins; cannot be edited or deleted. */
  isSystem: boolean;
};

export type RoleWithCount = RoleDef & { members: number };

function builtIn(key: (typeof STAFF_ROLES)[number]): RoleDef {
  return {
    key,
    name: ROLE_LABEL[key],
    description: ROLE_SUMMARY[key],
    capabilities: ROLE_CAPABILITIES[key],
    isSystem: true,
  };
}

/** One role by key, or null when no such role exists. Memoised per render. */
export const getRole = cache(async (key: string): Promise<RoleDef | null> => {
  if (isStaffRole(key)) return builtIn(key);

  const row = await prisma.admin_roles.findUnique({ where: { key } });
  if (!row || row.is_system) return null;

  return {
    key: row.key,
    name: row.name,
    description: row.description,
    capabilities: new Set(normaliseCapabilities(row.capabilities)),
    isSystem: false,
  };
});

/** Built-ins first (in their usual order), then custom roles by name. */
export const listRoles = cache(async (): Promise<RoleWithCount[]> => {
  const [rows, counts] = await Promise.all([
    prisma.admin_roles.findMany({
      where: { is_system: false },
      orderBy: { name: 'asc' },
    }),
    prisma.admin_staff.groupBy({ by: ['role'], _count: { _all: true } }),
  ]);

  const count = new Map(counts.map((c) => [c.role, c._count._all]));

  const custom: RoleWithCount[] = rows.map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    capabilities: new Set(normaliseCapabilities(row.capabilities)),
    isSystem: false,
    members: count.get(row.key) ?? 0,
  }));

  return [
    ...STAFF_ROLES.map((key) => ({
      ...builtIn(key),
      members: count.get(key) ?? 0,
    })),
    ...custom,
  ];
});

/**
 * May `granter` give `role` to somebody (or create it)? A Super Admin may give
 * anything. Anyone else may only give a role whose permissions they hold
 * themselves — otherwise a delegated user manager could hand themselves, or a
 * friend, more than they were ever given.
 */
export function canGrant(
  granter: { role: string; capabilities: ReadonlySet<Capability> },
  role: Pick<RoleDef, 'capabilities'>
): boolean {
  if (granter.role === 'super_admin') return true;
  for (const capability of role.capabilities) {
    if (!granter.capabilities.has(capability)) return false;
  }
  return true;
}

/** A display name for any stored role key, including a deleted one. */
export function roleName(key: string, roles: readonly RoleDef[]): string {
  return roles.find((r) => r.key === key)?.name ?? key;
}
