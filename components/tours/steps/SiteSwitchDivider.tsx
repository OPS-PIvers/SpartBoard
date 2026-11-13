import React from 'react';

/** The one-line break where a tour moves to another website. */
export const SiteSwitchDivider: React.FC<{
  label: string;
  /** On the Walk through's dark stage. */
  dark?: boolean;
}> = ({ label, dark = false }) => (
  <div
    data-testid="steps-site-switch"
    className={`flex w-full items-center gap-3 text-xs font-semibold print:break-after-avoid ${
      dark ? 'text-slate-200' : 'text-slate-600'
    }`}
  >
    <span
      className={`h-px flex-1 ${dark ? 'bg-slate-600' : 'bg-slate-200'}`}
      aria-hidden="true"
    />
    <span className="min-w-0 wrap-anywhere">{label}</span>
    <span
      className={`h-px flex-1 ${dark ? 'bg-slate-600' : 'bg-slate-200'}`}
      aria-hidden="true"
    />
  </div>
);
