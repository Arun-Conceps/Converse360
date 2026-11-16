import type { Metadata } from 'next';
import Image from 'next/image';

import { LoginForm } from '@/app/login/login-form';

export const metadata: Metadata = {
  title: 'Sign in · Converse360 Control Center',
};

/** Decorative rows for the floating card. Illustrative only, not real clients. */
const SAMPLE_ROWS = [
  { name: 'Northside Interiors', note: 'Healthy · Growth plan', tone: '#00ac55' },
  { name: 'Kapoor Realty', note: 'Trial · 4 days left', tone: '#e0a526' },
  { name: 'Acme Retail', note: 'Needs attention · Plan lapsed', tone: '#e05a5a' },
  { name: 'Mehta & Co.', note: 'Healthy · Starter plan', tone: '#00ac55' },
];

/**
 * Sign-in: a rounded card over a soft background. Left, a brand-green ring
 * graphic with a floating dark card; right, the form.
 *
 * Colours are local to this page on purpose (approved login mock-up), and the
 * page is always light: the panel behind it follows the user's own light/dark
 * choice, the sign-in screen deliberately does not.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div
      // `colorScheme` keeps native controls (autofill, scrollbars) light too.
      style={{ colorScheme: 'light' }}
      className="flex min-h-dvh items-center justify-center bg-[#eef4f0] px-4 py-10"
    >
      <div className="grid w-full max-w-[1080px] overflow-hidden rounded-[28px] bg-white shadow-[0_18px_60px_rgba(16,40,28,0.14)] md:min-h-[600px] md:grid-cols-2">
        {/* Brand side */}
        <div className="relative hidden items-center justify-center overflow-hidden bg-white p-10 md:flex">
          <svg
            viewBox="0 0 420 420"
            className="pointer-events-none absolute -top-10 -left-16 h-[420px] w-[420px]"
            aria-hidden
          >
            <g fill="none" stroke="#00ac55" strokeWidth="34">
              <circle cx="110" cy="130" r="38" />
              <circle cx="110" cy="130" r="98" />
              <circle cx="110" cy="130" r="158" />
              <circle cx="110" cy="130" r="218" />
              <circle cx="110" cy="130" r="278" />
            </g>
          </svg>

          <div className="relative z-10 flex min-h-[440px] w-full max-w-[310px] flex-col justify-between rounded-[28px] bg-[#101010] px-7 pt-8 pb-7 text-white shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <h2 className="text-center text-[17px] leading-snug font-medium">
              Every client, channel, ticket and renewal in one place.
            </h2>

            {/* stacked cards */}
            <div className="relative mx-auto my-6 h-[210px] w-[200px]" aria-hidden>
              <div className="absolute inset-0 translate-x-3 rotate-[5deg] rounded-2xl bg-white/90" />
              <div className="absolute inset-0 space-y-2.5 rounded-2xl bg-white p-3 shadow-md">
                {SAMPLE_ROWS.map((r) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: r.tone }}
                    >
                      {r.name[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-semibold text-[#1c2433]">
                        {r.name}
                      </span>
                      <span className="block truncate text-[8.5px] text-[#7b8494]">
                        {r.note}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-white/60">
              Internal operations for the Converse360 team. Access is per staff
              member, and every change is recorded in the audit log.
            </p>
          </div>
        </div>

        {/* Form side */}
        <div className="flex items-center justify-center px-6 py-14 sm:px-12">
          <div className="w-full max-w-[360px]">
            <Image
              src="/brand/converse360-wordmark.svg"
              alt="Converse360"
              width={768}
              height={120}
              priority
              unoptimized
              className="mb-8 h-8 w-auto"
            />
            <h1 className="text-[17px] font-semibold text-[#101010]">
              Sign in to the Control Center
            </h1>
            <p className="mt-0.5 mb-6 text-[13px] text-[#4a5568]">
              Use your staff email and password.
            </p>

            <LoginForm next={next} />
          </div>
        </div>
      </div>
    </div>
  );
}
