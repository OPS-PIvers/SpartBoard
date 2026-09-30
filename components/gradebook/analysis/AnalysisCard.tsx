import React from 'react';
import { ChevronDown } from 'lucide-react';

/** Mockup `.card`: half width on laptops, full width with `wide` and on phones. */
export const AnalysisCard: React.FC<{
  title: string;
  wide?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, wide = false, aside, children }) => (
  <section
    className={`col-span-12 ${wide ? '' : 'md:col-span-6'} flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}
  >
    <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-slate-800">
      {title}
      {aside}
    </h3>
    {children}
  </section>
);

export const Kpi: React.FC<{ value: React.ReactNode; label: string }> = ({
  value,
  label,
}) => (
  <div className="flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white px-[18px] py-4 shadow-sm">
    <b className="text-2xl font-bold text-slate-900">{value}</b>
    <span className="text-xs text-slate-500">{label}</span>
  </div>
);

/** Native select with the prototype's chevron. */
export const AnalysisSelect: React.FC<
  React.SelectHTMLAttributes<HTMLSelectElement> & { wrapClassName?: string }
> = ({ wrapClassName = '', className = '', ...rest }) => (
  <span className={`relative inline-flex ${wrapClassName}`}>
    <select
      {...rest}
      className={`appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-8 text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-[3px] focus:ring-brand-blue-primary/30 ${className}`}
    />
    <ChevronDown
      className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      aria-hidden
    />
  </span>
);
