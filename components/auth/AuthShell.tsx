/**
 * Shared chrome for the full-page auth surfaces (`/`, `/remote`, deactivated).
 *
 * Extracted so DeactivatedScreen mirrors the sign-in card structurally instead
 * of hand-copying its background and card styles — which is how the two drifted
 * apart in the first place.
 */
import React from 'react';

const LEGAL_NAV = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/support', label: 'Support' },
];

interface AuthShellProps {
  children: React.ReactNode;
  /** Legal links beneath the card. Off by default; `/remote` keeps them off. */
  showLegalLinks?: boolean;
}

export const AuthShell: React.FC<AuthShellProps> = ({
  children,
  showLegalLinks = false,
}) => (
  // The app locks `body { overflow: hidden }` for the dashboard, so this is its
  // own scroll container — a short mobile viewport would otherwise clip the card.
  <div className="relative h-screen w-screen overflow-y-auto bg-slate-50 font-sans">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50" />

    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-9 text-center shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_32px_rgba(15,23,42,.06)] sm:p-10">
        {children}
      </div>

      {showLegalLinks && (
        <nav className="mt-8 flex gap-5 text-xs text-slate-500">
          {LEGAL_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="transition hover:text-slate-800"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  </div>
);
