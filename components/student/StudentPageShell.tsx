import React from 'react';
import { ArrowLeft, GraduationCap, LogOut } from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import { StudentBrandBackdrop } from './StudentBrandBackdrop';

/**
 * The chrome every GIS-authenticated student page wears: brand header, page
 * background, centred column, footer. Shared so `/my-assignments` and the
 * project page cannot drift into two different-looking student surfaces.
 */
interface PageShellProps {
  onDone: () => void;
  /** `signOut` on `/my-assignments`; `back` on pages opened from it, so Done keeps the student signed in. */
  doneAction?: 'signOut' | 'back';
  children: React.ReactNode;
}

export const StudentPageShell: React.FC<PageShellProps> = ({
  onDone,
  doneAction = 'signOut',
  children,
}) => (
  <div className="relative h-screen h-dvh w-screen overflow-y-auto overflow-x-hidden bg-slate-50 font-sans">
    <StudentBrandBackdrop />

    <div className="relative z-10 flex min-h-full flex-col">
      <header className="relative z-30 flex h-[72px] shrink-0 items-center justify-between gap-4 bg-linear-to-r from-brand-blue-primary to-brand-blue-dark px-4 text-white shadow-md shadow-brand-blue-primary/20 sm:h-[80px] sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 shadow-xs ring-1 ring-white/20">
            <GraduationCap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
            {APP_NAME}
          </span>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label={
            doneAction === 'back'
              ? 'Done, back to my assignments'
              : 'Done, sign out'
          }
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:border-white/30 hover:bg-white/20 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-blue-primary"
        >
          {doneAction === 'back' ? (
            <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
          ) : (
            <LogOut className="h-4 w-4" strokeWidth={2.25} />
          )}
          <span>Done</span>
        </button>
      </header>

      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
          {children}
        </div>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-6 text-center text-xs font-medium text-slate-400 sm:px-8">
          {APP_NAME}
        </footer>
      </div>
    </div>
  </div>
);
