'use client';

import { Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Modal } from '@/components/ui/modal';

/** A button that opens a plan's edit form (or read-only limits) in a modal. */
export function PlanModal({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary hover:text-primary-hover inline-flex items-center gap-1.5 text-sm font-semibold"
      >
        <Pencil aria-hidden className="size-3.5" />
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
      >
        {children}
      </Modal>
    </>
  );
}
