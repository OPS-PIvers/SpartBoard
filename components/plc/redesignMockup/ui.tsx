// Small presentational pieces for the Teams redesign harness, built only from classes the PLC pages already use.

import React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  type LucideIcon,
} from 'lucide-react';

/** Section heading used across PLC detail and Admin panels. */
export const EYEBROW =
  'text-xs font-bold uppercase tracking-widest text-slate-500';
/** From GoalEditorModal. */
export const INPUT =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30';
/** From PlcAssessmentList. */
export const MENU_ITEM =
  'flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50';
export const MENU_PANEL =
  'bg-white border border-slate-200 rounded-xl shadow-lg py-1';
export const CHECKBOX =
  'h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40';
export const META = 'text-xs text-slate-500';
export const PAGE = 'mx-auto w-full max-w-6xl px-6 pb-16';

export const SectionHead: React.FC<{
  title: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  as?: 'h2' | 'h3';
}> = ({ title, meta, children, as: Tag = 'h3' }) => (
  <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
    <Tag className={EYEBROW}>{title}</Tag>
    {meta && <span className={`${META} truncate`}>{meta}</span>}
    <span className="flex-1" />
    {children}
  </div>
);

/** Inline action link, as on the PLC Home tile footer. */
export const TextLink: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: LucideIcon;
    quiet?: boolean;
  }
> = ({ icon: Icon, quiet = false, className = '', children, ...props }) => (
  <button
    type="button"
    className={`inline-flex shrink-0 items-center gap-1 rounded text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
      quiet
        ? 'text-slate-500 hover:text-slate-800'
        : 'text-brand-blue-primary hover:text-brand-blue-dark'
    } ${className}`}
    {...props}
  >
    {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
    {children}
  </button>
);

/** One-line sort or filter menu: a native select that reads as text. */
export const MenuSelect: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange?: (value: string) => void;
  anchor?: TourAnchorAttrs;
}> = ({ label, value, options, onChange, anchor }) => (
  <span className="relative inline-flex items-center">
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      {...anchor}
      className="appearance-none rounded-md bg-transparent py-1 pl-1.5 pr-5 [field-sizing:content] text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-1 h-3 w-3 text-slate-400"
      aria-hidden="true"
    />
  </span>
);

export type StatusTone = 'done' | 'warn' | 'none';

const STATUS: Record<StatusTone, { icon: LucideIcon; className: string }> = {
  done: { icon: CheckCircle2, className: 'text-emerald-700' },
  warn: { icon: AlertTriangle, className: 'text-amber-700' },
  none: { icon: Circle, className: 'text-slate-500' },
};

/** Status as icon plus words, never colour alone. */
export const StatusLabel: React.FC<{
  tone: StatusTone;
  children: React.ReactNode;
}> = ({ tone, children }) => {
  const { icon: Icon, className } = STATUS[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
};

/** Hairline list; rows sit on the page, not in boxes. */
export const RowList: React.FC<{
  children: React.ReactNode;
  label?: string;
}> = ({ children, label }) => (
  <ul aria-label={label} className="divide-y divide-slate-100">
    {children}
  </ul>
);

export const Row: React.FC<{
  icon?: LucideIcon;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
  muted?: boolean;
}> = ({ icon: Icon, title, meta, trailing, leading, muted = false }) => (
  <li className="flex items-center gap-3 py-2.5">
    {leading}
    {Icon && (
      <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
    )}
    <div className="min-w-0 flex-1">
      <p
        className={`truncate text-sm ${muted ? 'text-slate-400 line-through' : 'text-slate-800'}`}
      >
        {title}
      </p>
      {meta && <p className={`${META} mt-0.5 truncate`}>{meta}</p>}
    </div>
    {trailing}
  </li>
);

export const Section: React.FC<{
  children: React.ReactNode;
  first?: boolean;
  className?: string;
  label?: string;
}> = ({ children, first = false, className = '', label }) => (
  <section
    aria-label={label}
    className={`${first ? 'pt-6' : 'border-t border-slate-200 pt-6'} pb-6 ${className}`}
  >
    {children}
  </section>
);

/** Action item row with the complete-circle control from YourActionItemsCard. */
export const ActionItem: React.FC<{
  title: string;
  meta: React.ReactNode;
  done?: boolean;
  trailing?: React.ReactNode;
}> = ({ title, meta, done = false, trailing }) => (
  <li className="flex items-center gap-3 py-2.5">
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={title}
      className={`shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
        done ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'
      }`}
    >
      {done ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Circle className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
    <div className="min-w-0 flex-1">
      <p
        className={`truncate text-sm ${done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
      >
        {title}
      </p>
      <p className={`${META} mt-0.5 truncate`}>{meta}</p>
    </div>
    {trailing}
  </li>
);

/** Large headline figure, as on the assessment detail page. */
export const Figure: React.FC<{
  value: React.ReactNode;
  label: React.ReactNode;
}> = ({ value, label }) => (
  <div>
    <div className="text-3xl font-extrabold tabular-nums text-slate-800">
      {value}
    </div>
    <div className={`${META} mt-0.5`}>{label}</div>
  </div>
);
