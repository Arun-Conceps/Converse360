import 'server-only';

import { cache } from 'react';

import { prisma } from '@/lib/prisma';

/**
 * Staff, minus the password hash. Nothing outside lib/auth.ts and the staff
 * actions ever selects `password_hash`.
 *
 * `role` is the role KEY — a built-in or a custom role (migration 101). Turn
 * it into a name with `roleName()` from lib/staff/role-store.ts.
 */
export type StaffMember = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
};

const SAFE_SELECT = {
  id: true,
  email: true,
  full_name: true,
  role: true,
  is_active: true,
  last_login_at: true,
  created_at: true,
  created_by: true,
} as const;

export const listStaff = cache(
  async (opts: { activeOnly?: boolean } = {}): Promise<StaffMember[]> => {
    const rows = await prisma.admin_staff.findMany({
      where: opts.activeOnly ? { is_active: true } : undefined,
      select: SAFE_SELECT,
      orderBy: [{ is_active: 'desc' }, { full_name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.full_name,
      role: row.role,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  }
);

/** Active staff for assignment pickers. */
export async function assignableStaff(): Promise<StaffMember[]> {
  return listStaff({ activeOnly: true });
}
