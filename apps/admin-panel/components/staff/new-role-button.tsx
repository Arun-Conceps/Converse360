'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { RoleForm } from '@/components/staff/role-form';
import { Modal } from '@/components/ui/modal';

/** "Add new role" — opens the create form in a modal. */
export function NewRoleButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-primary text-on-primary hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition"
      >
        <Plus aria-hidden className="size-4" />
        Add new role
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add new role"
        description="Tick the modules this role may use. You can edit it later and the change applies on people's next click."
      >
        <RoleForm onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}
