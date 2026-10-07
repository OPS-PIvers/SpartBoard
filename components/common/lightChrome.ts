// Solid light chrome shared by live tours and Guided Learning (docs/plans/TOUR_LIGHT_CHROME.md).
export const chromeShadow =
  'shadow-[0_1px_2px_rgba(2,6,23,.2),0_12px_24px_-6px_rgba(2,6,23,.45),0_32px_64px_-16px_rgba(2,6,23,.55)]';
export const chromeSurface = `border border-slate-900/[0.08] bg-white text-slate-900 ${chromeShadow}`;
export const chromeBody = 'text-slate-600';
export const chromeMuted = 'text-slate-500';
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50';

export const primaryBtn = `rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue-dark ${focusRing}`;
export const secondaryBtn = `rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-blue-primary hover:bg-brand-blue-lighter ${focusRing}`;
export const iconBtn = `rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`;

export const headerBar = 'bg-brand-blue-dark text-white';
export const headerIconBtn =
  'rounded-lg p-1.5 text-[#c3cae6] hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

export const inputLight =
  'border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 [color-scheme:light] focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30';
export const warnChip =
  'inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 text-amber-800';
