/**
 * Shared layout for the public legal/support pages (/privacy, /terms, /support).
 *
 * These render on ANONYMOUS, no-provider routes so they are publicly viewable
 * without sign-in — Google's OAuth consent / Marketplace review requires the
 * Privacy Policy + Terms URLs to load without authentication.
 *
 * Light-mode, high-legibility (brand uses light mode for public-facing pages).
 */
import React from 'react';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

const NAV = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/support', label: 'Support' },
];

export const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({
  title,
  lastUpdated,
  children,
}) => (
  // The app locks `body { overflow: hidden; height: 100% }` (dashboard never
  // scrolls), so a `min-h-screen` page would be clipped. Make this layout its
  // own viewport-height scroll container instead.
  <div className="flex h-screen flex-col overflow-y-auto bg-slate-50 font-sans text-slate-800">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <img src="/favicon.png" alt="" className="h-8 w-8 rounded" />
          <span className="text-lg font-semibold text-slate-900">
            SpartBoard
          </span>
        </a>
        <nav className="flex gap-5 text-sm">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-slate-600 transition hover:text-slate-900"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>

    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {lastUpdated}</p>
      <div className="mt-8">{children}</div>
    </main>

    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-6 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Orono Public Schools</span>
        <nav className="flex gap-5">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="transition hover:text-slate-900"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  </div>
);

/** Section heading inside legal prose. */
export const LegalH2: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <h2 className="mt-10 mb-3 text-xl font-semibold text-slate-900">
    {children}
  </h2>
);

/** Body paragraph inside legal prose. */
export const LegalP: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <p className="mb-4 leading-relaxed text-slate-700">{children}</p>;

/** Bulleted list inside legal prose. */
export const LegalList: React.FC<{ items: React.ReactNode[] }> = ({
  items,
}) => (
  <ul className="mb-4 list-disc space-y-2 pl-6 leading-relaxed text-slate-700">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);
