'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PlanForm } from '@/components/plans/plan-form';
import { Modal } from '@/components/ui/modal';

/** "Add plan": opens the create form in a modal. */
export function NewPlanButton({ currencyCode }: { currencyCode: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-primary text-on-primary hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition"
      >
        <Plus aria-hidden className="size-4" />
        Add plan
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a plan"
        description="Set the price and limits. It is offered to new signups only if you leave Offered ticked."
      >
        <PlanForm currencyCode={currencyCode} onSaved={() => setOpen(false)} />
      </Modal>
    </>
  );
}
