'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A modal dialog on the native <dialog> element: focus is trapped, Escape and
 * a click on the backdrop close it, and the page behind is inert. Mount the
 * contents only while `open` so a form inside starts fresh every time.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="bg-surface text-ink border-ring shadow-pop m-auto max-h-[90dvh] w-[min(56rem,calc(100vw-2rem))] rounded-2xl border p-0 backdrop:bg-black/50"
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="border-line flex items-start justify-between gap-4 border-b px-6 py-4">
            <div>
              <h2 className="text-ink text-base font-semibold">{title}</h2>
              {description ? (
                <p className="text-muted mt-0.5 text-sm">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted hover:bg-surface-2 hover:text-ink -mt-1 -mr-2 grid size-8 place-items-center rounded-lg"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
