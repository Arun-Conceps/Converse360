'use client';

import { Moon, Sun } from 'lucide-react';

import { MODE_STORAGE_KEY, type Mode } from '@/lib/theme';

/**
 * Light/dark switch. It reads and writes `html[data-mode]` directly, and the
 * icon follows a CSS selector instead of React state, so there is nothing to
 * hydrate and no flash: the boot script in app/layout.tsx has already set the
 * mode before first paint.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next: Mode = root.dataset.mode === 'dark' ? 'light' : 'dark';
    root.dataset.mode = next;
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // Private mode: the choice still applies until the tab closes.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      title="Switch between light and dark mode"
      className="text-ink-2 hover:bg-surface-2 grid size-9 place-items-center rounded-lg"
    >
      {/* Moon in light mode (go dark), sun in dark mode (go light). */}
      <Moon
        aria-hidden
        className="size-[18px] [html[data-mode=dark]_&]:hidden"
      />
      <Sun
        aria-hidden
        className="hidden size-[18px] [html[data-mode=dark]_&]:block"
      />
    </button>
  );
}
