import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AUTH_CARD,
  AUTH_PAGE_BG,
  AUTH_PAGE_DOTS,
} from '@/components/auth/authShellStyles';

interface StudentScreenShellProps {
  children: React.ReactNode;
  /** A welcome card is wider than the plain join, locked and end cards. */
  wide?: boolean;
  /** Full-width bar above the card, such as the teacher preview banner. */
  banner?: React.ReactNode;
}

/** Every student app's full-page join, locked and end card, in the sign-in page's style. */
export const StudentScreenShell: React.FC<StudentScreenShellProps> = ({
  children,
  wide = false,
  banner,
}) => (
  <div
    className={`relative flex h-screen h-dvh flex-col overflow-y-auto ${AUTH_PAGE_BG}`}
  >
    <div className={AUTH_PAGE_DOTS} aria-hidden="true" />
    {banner && <div className="relative">{banner}</div>}
    <div className="relative flex flex-1 items-center justify-center px-4 py-10">
      <div className={`${wide ? 'max-w-md' : 'max-w-sm'} ${AUTH_CARD}`}>
        {children}
      </div>
    </div>
  </div>
);

export const StudentScreenLogo: React.FC = () => (
  <img
    src="/favicon.png"
    alt=""
    className="mx-auto mb-5 h-11 w-11 rounded-xl"
  />
);

/** The round icon mark above a card's title. */
export const StudentScreenMark: React.FC<{ icon: LucideIcon }> = ({
  icon: Icon,
}) => (
  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-lighter">
    <Icon className="h-6 w-6 text-brand-blue-primary" aria-hidden />
  </div>
);

/** The activity's name, small, above the card title. */
export const StudentScreenEyebrow: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <p className="text-sm font-medium break-words text-slate-500">{children}</p>
);

export const StudentScreenTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 break-words">
    {children}
  </h1>
);

export const StudentScreenError: React.FC<{ message: string | null }> = ({
  message,
}) =>
  message ? (
    <p role="alert" className="mt-4 text-sm text-brand-red-primary">
      {message}
    </p>
  ) : null;

export const STUDENT_PRIMARY_BUTTON =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-brand-blue-primary py-3 text-sm font-semibold text-white shadow-sm shadow-brand-blue-primary/20 transition-colors hover:bg-brand-blue-dark focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-60';

export const STUDENT_TEXT_BUTTON =
  'mt-3 w-full py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand-blue-primary';

export const STUDENT_INPUT =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-lg font-semibold tracking-widest text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder-slate-400 focus:border-brand-blue-primary focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/20';
