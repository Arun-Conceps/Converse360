import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { MODE_STORAGE_KEY } from '@/lib/theme';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Converse360 Control Center',
  description:
    'Internal operations for Converse360: clients, health, support, onboarding and revenue.',
  // An internal billing panel has no business in a search index.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-mode="light"
      // The boot script below sets data-mode before first paint, so the
      // server-rendered "light" and the user's stored choice can differ.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply the user's saved light/dark choice before paint (no flash).
            Light is the default; the OS setting is deliberately not consulted. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem('${MODE_STORAGE_KEY}');document.documentElement.dataset.mode=m==='dark'?'dark':'light'}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
