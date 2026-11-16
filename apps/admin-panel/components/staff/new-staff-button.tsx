'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { CreateStaff, type RoleOption } from '@/components/staff/create-staff';
import { Modal } from '@/components/ui/modal';

/**
 * "Add user" — opens the create form in a modal. Unlike the role modal it does
 * not close itself on success: the generated temporary password is shown once,
 * inside the form, and the person must be able to copy it before closing.
 */
export function NewStaffButton({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-primary text-on-primary hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition"
      >
        <Plus aria-hidden className="size-4" />
        Add user
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a user"
        description="They get a generated temporary password, shown to you once."
      >
        <CreateStaff roles={roles} />
      </Modal>
    </>
  );
}
