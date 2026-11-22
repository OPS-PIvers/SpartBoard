/**
 * Shared chrome for the full-page auth surfaces (`/`, `/remote`, deactivated).
 *
 * Extracted so DeactivatedScreen mirrors the sign-in card structurally instead
 * of hand-copying its background and card styles — which is how the two drifted
 * apart in the first place.
 */
import React from 'react';
import { AUTH_CARD, AUTH_PAGE_BG, AUTH_PAGE_DOTS } from './authShellStyles';

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
  <div className={`relative h-screen w-screen overflow-y-auto ${AUTH_PAGE_BG}`}>
    <div className={AUTH_PAGE_DOTS} />

    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className={`max-w-sm ${AUTH_CARD}`}>{children}</div>

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
