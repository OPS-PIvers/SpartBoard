import React from 'react';
import { GraduationCap, LogOut, Menu } from 'lucide-react';
import { APP_NAME } from '@/config/constants';

/**
 * The chrome every GIS-authenticated student page wears: brand header, page
 * background, centred column, footer. Shared so `/my-assignments` and the
 * project page cannot drift into two different-looking student surfaces.
 */
interface PageShellProps {
  onDone: () => void;
  /**
   * When set, the brand icon is replaced with a hamburger menu button that
   * toggles the slide-out class sidebar. Gate paths (loading / no-classes /
   * error) omit it and render the brand chip as before.
   */
  onToggleMenu?: () => void;
  menuOpen?: boolean;
  /**
   * Ref forwarded to the hamburger menu button so the page can restore
   * focus there when the sidebar closes (e.g. via Esc, backdrop tap, or
   * auto-close on class selection). Without this, focus left inside the
   * now-`inert` sidebar would be stranded for keyboard users.
   */
  menuButtonRef?: React.Ref<HTMLButtonElement>;
  /**
   * When true, suppresses the header's Done button. Sign-out lives in the
   * sidebar footer once the student is past the gate paths.
   */
  hideDoneButton?: boolean;
  children: React.ReactNode;
}

export const StudentPageShell: React.FC<PageShellProps> = ({
  onDone,
  onToggleMenu,
  menuOpen,
  menuButtonRef,
  hideDoneButton,
  children,
}) => (
  <div className="relative min-h-screen w-screen overflow-x-hidden bg-slate-50 font-sans">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
    <div className="pointer-events-none absolute left-[-15%] top-[-10%] h-[500px] w-[500px] rounded-full bg-brand-blue-primary/15 blur-[120px]" />
    <div className="pointer-events-none absolute bottom-[-15%] right-[-10%] h-[500px] w-[500px] rounded-full bg-brand-red-primary/10 blur-[120px]" />

    <div className="relative z-10 flex min-h-screen flex-col">
      {/* Header — full-width, anchored. Brand-blue with white text. The
          hamburger never shifts when the sidebar opens; the sidebar slides
          in *below* this header (top: PAGE_HEADER_HEIGHT). */}
      <header className="relative z-30 flex h-[72px] shrink-0 items-center justify-between gap-4 bg-gradient-to-r from-brand-blue-primary to-brand-blue-dark px-4 text-white shadow-md shadow-brand-blue-primary/20 sm:h-[80px] sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {onToggleMenu ? (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={onToggleMenu}
              aria-label={menuOpen ? 'Close class menu' : 'Open class menu'}
              aria-expanded={menuOpen}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-sm transition hover:border-white/30 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-blue-primary"
            >
              <Menu className="h-5 w-5" strokeWidth={2.25} />
            </button>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 shadow-sm ring-1 ring-white/20">
              <GraduationCap className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
          )}
          <span className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">
            {APP_NAME}
          </span>
        </div>
        {!hideDoneButton && (
          <button
            type="button"
            onClick={onDone}
            aria-label="Done — sign out"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-white/30 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-blue-primary"
          >
            <LogOut className="h-4 w-4" strokeWidth={2.25} />
            <span>Done</span>
          </button>
        )}
      </header>

      {/* Body — pushed right when sidebar is open on desktop. The header
          above stays anchored. */}
      <div
        className={`flex flex-1 flex-col transition-[padding] duration-200 ${
          onToggleMenu && menuOpen ? 'md:pl-[280px]' : ''
        }`}
      >
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
