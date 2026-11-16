'use client';

import {
  ChevronDown,
  ChevronsUpDown,
  KeyRound,
  LogOut,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * The signed-in staff member's menu in the top bar.
 *
 * Closes on a click or tap outside it, on Escape, and when a link inside it is
 * followed — a plain <details> does none of these, so it stayed open over the
 * page. Sign-out is a server action passed in as a prop; it posts as a normal
 * form, so it works with scripting off too.
 */
export function ProfileMenu({
  name,
  email,
  roleLabel,
  initials,
  isBreakGlass,
  signOut,
  variant = 'top',
}: {
  name: string;
  email: string;
  roleLabel: string;
  initials: string;
  isBreakGlass: boolean;
  signOut: () => Promise<void>;
  /** `rail` is the full-width card at the bottom of the sidebar; its menu opens upward. */
  variant?: 'top' | 'rail';
}) {
  const rail = variant === 'rail';
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const item =
    'text-ink-2 hover:bg-surface-2 hover:text-ink flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          rail
            ? 'bg-surface-2 hover:bg-rail-2 flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors'
            : 'hover:bg-surface-2 flex items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1'
        }
      >
        <span
          aria-hidden
          className={`bg-primary-soft text-primary-soft-ink grid place-items-center rounded-full text-xs font-bold ${
            rail ? 'size-9 shrink-0' : 'size-8'
          }`}
        >
          {initials}
        </span>
        <span
          className={`min-w-0 text-left ${rail ? 'flex-1' : 'hidden sm:block'}`}
        >
          <span className="text-ink block max-w-40 truncate text-[13px] leading-tight font-semibold">
            {name}
          </span>
          <span className="text-muted block text-[11px] leading-tight">
            {roleLabel}
          </span>
        </span>
        {rail ? (
          <ChevronsUpDown aria-hidden className="text-muted size-4 shrink-0" />
        ) : (
          <ChevronDown
            aria-hidden
            className={`text-muted hidden size-4 transition-transform sm:block ${
              open ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className={`border-ring bg-surface shadow-pop absolute z-40 rounded-xl border p-2 ${
            rail ? 'right-0 bottom-full left-0 mb-2' : 'right-0 mt-2 w-64'
          }`}
        >
          <div className="border-line border-b px-2.5 pt-1.5 pb-2.5">
            <p className="text-ink truncate text-sm font-semibold">{name}</p>
            <p className="text-muted truncate text-xs">{email}</p>
            <p className="text-primary-soft-ink bg-primary-soft mt-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold">
              {roleLabel}
            </p>
            {isBreakGlass ? (
              <p className="bg-warn-soft text-warn-fg mt-2 rounded-md px-2 py-1 text-[11px] leading-snug">
                Break-glass login. Create a staff account for day-to-day use.
              </p>
            ) : null}
          </div>

          <div className="mt-1 space-y-0.5">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={item}
            >
              <UserRound aria-hidden className="size-4" />
              Profile
            </Link>
            <Link
              href="/account/password"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={item}
            >
              <KeyRound aria-hidden className="size-4" />
              Change password
            </Link>
          </div>

          <form action={signOut} className="border-line mt-1 border-t pt-1">
            <button type="submit" role="menuitem" className={item}>
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
