'use client';

import { CornerDownLeft, KeyRound, Search, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { ITEM_ICONS } from '@/components/shell/nav';

export type SearchPage = { href: string; label: string; group: string };

const EXTRA_ICONS: Record<string, typeof UserRound> = {
  '/account': UserRound,
  '/account/password': KeyRound,
};

/**
 * The top bar's search. Typing suggests matching menu pages (so "pl" offers
 * Plans & Pricing); the last row always searches clients, which is what the
 * box did before. Arrow keys move, Enter opens, Escape closes. Without
 * scripting it is still a plain GET form to /clients.
 */
export function GlobalSearch({ pages }: { pages: SearchPage[] }) {
  const router = useRouter();
  const listId = useId();
  const root = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const q = query.trim().toLowerCase();
  const matches = q
    ? pages
        .filter(
          (page) =>
            page.label.toLowerCase().includes(q) ||
            page.group.toLowerCase().includes(q)
        )
        .sort((a, b) => {
          // Names that start with the query first.
          const rank = (p: SearchPage) =>
            p.label.toLowerCase().startsWith(q) ? 0 : 1;
          return rank(a) - rank(b);
        })
        .slice(0, 6)
    : [];

  // Rows: matching pages, then "search clients" (when there is text).
  const rowCount = matches.length + (q ? 1 : 0);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function go(index: number) {
    setOpen(false);
    const page = matches[index];
    if (page) {
      router.push(page.href);
      setQuery('');
    } else {
      router.push(`/clients?q=${encodeURIComponent(query.trim())}`);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (rowCount === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % rowCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + rowCount) % rowCount);
    }
  }

  const showList = open && q.length > 0;

  return (
    <form
      ref={root}
      action="/clients"
      method="get"
      role="search"
      className="relative max-w-md min-w-0 flex-1"
      onSubmit={(event) => {
        if (!q) return;
        event.preventDefault();
        go(active);
      }}
    >
      <Search
        aria-hidden
        className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <label htmlFor="global-search" className="sr-only">
        Search pages and clients
      </label>
      <input
        id="global-search"
        name="q"
        type="search"
        value={query}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Search pages or clients — name, email, WABA or phone ID"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="border-ring bg-surface-2 text-ink placeholder:text-muted focus:border-primary focus:bg-surface h-10 w-full rounded-lg border pr-3 pl-9 text-sm"
      />

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="border-ring bg-surface shadow-pop absolute top-full right-0 left-0 z-40 mt-2 overflow-hidden rounded-xl border p-1.5"
        >
          {matches.length > 0 ? (
            <li
              role="presentation"
              className="text-muted px-2.5 pt-1 pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] uppercase"
            >
              Pages
            </li>
          ) : null}
          {matches.map((page, index) => {
            const Icon = ITEM_ICONS[page.href] ?? EXTRA_ICONS[page.href];
            return (
              <Row
                key={page.href}
                active={active === index}
                onHover={() => setActive(index)}
                onPick={() => go(index)}
                icon={Icon ? <Icon aria-hidden className="size-4" /> : null}
                title={page.label}
                hint={page.group}
              />
            );
          })}
          <Row
            active={active === matches.length}
            onHover={() => setActive(matches.length)}
            onPick={() => go(matches.length)}
            icon={<Search aria-hidden className="size-4" />}
            title={`Search clients for "${query.trim()}"`}
            hint="Clients"
          />
        </ul>
      ) : null}
    </form>
  );
}

function Row({
  active,
  onHover,
  onPick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onPick}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
          active ? 'bg-primary-soft text-primary-soft-ink' : 'text-ink-2'
        }`}
      >
        <span className="text-muted shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span className="text-muted shrink-0 text-xs">{hint}</span>
        {active ? (
          <CornerDownLeft aria-hidden className="text-muted size-3.5" />
        ) : null}
      </button>
    </li>
  );
}
