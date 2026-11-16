'use client';

import { useActionState, useState } from 'react';

import { login, type LoginState } from '@/lib/actions/auth';

const inputClass =
  'block w-full rounded-full border border-[#101010] bg-white px-4 py-3 text-[14px] text-[#101010] placeholder:text-[#8b93a1] focus:outline-none focus:ring-2 focus:ring-[#00ac55]/40';

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );
  const [showHelp, setShowHelp] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-[#101010]">
          Work Email
        </span>
        <input
          name="username"
          placeholder="you@company.com"
          autoComplete="username"
          inputMode="email"
          autoFocus
          required
          spellCheck={false}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-[#101010]">
          Password
        </span>
        <input
          type="password"
          name="password"
          placeholder="Your password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl bg-[#feebed] px-4 py-2.5 text-[12px] leading-snug text-[#a62f3a]"
        >
          <strong className="font-semibold">Not signed in.</strong>{' '}
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[#333] py-3 text-[14px] font-medium text-white transition hover:bg-[#101010] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00ac55]/50 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="pt-1 text-[12px] text-[#7b8494]">
        Forgot your password?{' '}
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          aria-expanded={showHelp}
          className="font-medium text-[#101010] hover:underline"
        >
          Get help
        </button>
      </p>

      {showHelp ? (
        <p className="rounded-2xl bg-[#eef6f1] px-4 py-2.5 text-[12px] leading-snug text-[#2f4a3b]">
          Ask a Super Admin to reset your password. They can do it from Staff
          &amp; roles, and your old sessions end immediately.
        </p>
      ) : null}
    </form>
  );
}
