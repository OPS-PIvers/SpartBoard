import React from 'react';

/**
 * Shared visual style for the draggable student name chip. Defined in one
 * place so the unassigned bucket and the per-station chip lists stay in sync.
 *
 * Caller is responsible for layering text-color/font overrides via inline
 * style — those depend on the active typography settings and live in the
 * widget's render path.
 */
export const studentChipClass =
  'bg-white border-b-2 border-slate-200 rounded-xl font-black text-slate-700 shadow-sm hover:border-brand-blue-primary hover:-translate-y-0.5 transition-all active:scale-90';

export const studentChipStyle: React.CSSProperties = {
  fontSize: 'min(13px, 3.8cqmin)',
  padding: 'min(5px, 1.2cqmin) min(9px, 2.2cqmin)',
};
