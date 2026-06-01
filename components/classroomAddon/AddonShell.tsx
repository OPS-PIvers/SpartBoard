/**
 * Shared, brand-aligned UI kit for the Google Classroom add-on iframes
 * (teacher attachment-setup + student view). These screens render inside
 * Classroom's fixed-height iframe, so the shell owns the scroll (the document
 * body is `overflow: hidden` globally): an `h-screen overflow-y-auto` outer with
 * a `min-h-full` inner centers short content and scrolls tall content — the same
 * pattern QuizStudentApp's period picker uses.
 *
 * The visual language is SpartBoard's: calm dark glassmorphism, Lexend (`font-
 * sans`), brand-blue accents, generous spacing, restrained motion. None of the
 * spike-era debug tables / log panels live here; raw diagnostics are confined to
 * <AddonDevPanel>, which renders only in DEV builds.
 */
import React, { useRef, useState } from 'react';
import {
  Loader2,
  AlertTriangle,
  ChevronDown,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

/**
 * Full-bleed branded page wrapper. Fills the Classroom iframe, paints the calm
 * slate gradient + a subtle brand glow, and owns the vertical scroll so content
 * taller than the iframe is always reachable.
 */
export const AddonShell: React.FC<{
  children: React.ReactNode;
  /** Max content width. Defaults to a comfortable single-column card width. */
  maxWidthClassName?: string;
}> = ({ children, maxWidthClassName = 'max-w-xl' }) => (
  <div className="h-screen overflow-y-auto bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 font-sans text-slate-100">
    {/* Decorative brand glow — purely atmospheric, behind the content. */}
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-brand-blue-primary/20 blur-3xl"
    />
    <div className="relative min-h-full px-4 py-8 sm:px-6">
      <div className={`mx-auto w-full ${maxWidthClassName}`}>{children}</div>
    </div>
  </div>
);

/**
 * Brand lockup + page title. A small gradient tile carries the section icon so
 * the screen reads as SpartBoard at a glance even inside Classroom's chrome.
 */
export const AddonHeader: React.FC<{
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}> = ({ icon: Icon, title, subtitle }) => (
  <header className="mb-6 flex items-start gap-3.5">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue-light to-brand-blue-primary shadow-lg shadow-brand-blue-primary/30">
      <Icon className="h-5 w-5 text-white" strokeWidth={2.25} />
    </div>
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
      </div>
      {subtitle && (
        <p className="mt-0.5 text-sm leading-snug text-slate-400">{subtitle}</p>
      )}
    </div>
  </header>
);

/** A frosted-glass surface — the standard content container for these screens. */
export const AddonCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`rounded-2xl border border-white/10 bg-white/[0.06] shadow-xl shadow-black/30 backdrop-blur-xl ${className}`}
  >
    {children}
  </div>
);

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand-blue-primary to-brand-blue-light text-white shadow-lg shadow-brand-blue-primary/25 hover:brightness-110 focus-visible:ring-brand-blue-light',
  secondary:
    'border border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 focus-visible:ring-white/30',
  ghost:
    'text-slate-300 hover:bg-white/10 hover:text-white focus-visible:ring-white/30',
};

/** Brand button with a built-in loading spinner + consistent focus ring. */
export const AddonButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    loading?: boolean;
    icon?: LucideIcon;
  }
> = ({
  variant = 'primary',
  loading = false,
  icon: Icon,
  disabled,
  className = '',
  children,
  ...rest
}) => (
  <button
    type="button"
    disabled={(disabled ?? false) || loading}
    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANT[variant]} ${className}`}
    {...rest}
  >
    {loading ? (
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    ) : (
      Icon && <Icon className="h-4 w-4" aria-hidden="true" />
    )}
    {children}
  </button>
);

/**
 * Single-line progress indicator — replaces the spike's scrolling log. Shows the
 * current step with a spinner while work is in flight; an idle/last message
 * otherwise. `aria-live` so screen readers hear step changes.
 */
export const AddonStatus: React.FC<{
  message: string | null;
  busy?: boolean;
}> = ({ message, busy = false }) => {
  if (!message) return null;
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-slate-400"
    >
      {busy && (
        <Loader2
          className="h-4 w-4 shrink-0 animate-spin text-brand-blue-light"
          aria-hidden="true"
        />
      )}
      <span>{message}</span>
    </div>
  );
};

/** Branded inline error banner. */
export const AddonError: React.FC<{ message: string | null }> = ({
  message,
}) =>
  message ? (
    <div className="flex items-start gap-2.5 rounded-xl border border-brand-red-light/40 bg-brand-red-primary/15 p-3 text-sm text-red-100">
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-brand-red-light"
        aria-hidden="true"
      />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  ) : null;

export interface AddonSelectOption {
  value: string;
  label: string;
}

/**
 * Brand-styled single-select dropdown. A native `<select>`'s open option list is
 * OS-rendered (unstyled, overflows the control, jarring against the dark glass),
 * so this is a custom listbox: a glass trigger + a popover that is pinned to the
 * trigger's width (`left-0 right-0`) and scrolls (`max-h-60`) instead of
 * spilling past its container. Click-outside + Escape close it; long labels
 * truncate. Empty option lists show a muted placeholder row rather than a
 * zero-height popup.
 */
export const AddonSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: AddonSelectOption[];
  placeholder: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}> = ({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  id,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          else if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex w-full items-center gap-2 rounded-xl border border-white/15 bg-slate-900/50 px-3.5 py-2.5 text-left text-sm transition hover:bg-slate-900/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={`min-w-0 flex-1 truncate ${selected ? 'text-white' : 'text-slate-500'}`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-slate-800/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">
              Nothing to choose yet
            </li>
          ) : (
            options.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                      active
                        ? 'bg-brand-blue-primary/20 text-white'
                        : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {active && (
                      <Check
                        className="h-4 w-4 shrink-0 text-brand-blue-light"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
};
