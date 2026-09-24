// Shared PLC Home v2 tile chrome: icon + title header, body, and an optional deep link.

import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

interface TileFrameProps {
  icon: LucideIcon;
  title: string;
  hero: boolean;
  /** Top-right slot beside the title (badges, the spotlight button). */
  headerExtra?: React.ReactNode;
  /** Deep link into the owning section (D3). */
  link?: { label: string; onClick: () => void };
  children: React.ReactNode;
}

export const TileFrame: React.FC<TileFrameProps> = ({
  icon: Icon,
  title,
  hero,
  headerExtra,
  link,
  children,
}) => (
  <section
    aria-label={title}
    data-hero={hero ? 'true' : undefined}
    className={`flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ${
      hero ? '' : 'min-h-[15rem]'
    }`}
  >
    <header className="flex items-center gap-2.5 px-5 pt-4 pb-2">
      <Icon
        className="h-4 w-4 shrink-0 text-brand-blue-primary"
        aria-hidden="true"
      />
      <h3
        className={`min-w-0 flex-1 truncate font-bold text-slate-800 ${
          hero ? 'text-base' : 'text-sm'
        }`}
      >
        {title}
      </h3>
      {headerExtra}
    </header>
    <div className="flex-1 min-h-0 px-5 pb-4">{children}</div>
    {link && (
      <button
        type="button"
        onClick={link.onClick}
        className="flex items-center justify-end gap-1 border-t border-slate-100 px-5 py-2.5 text-xs font-semibold text-brand-blue-primary transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary/40"
      >
        {link.label}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    )}
  </section>
);

/** Muted one-line empty state inside a tile body. */
export const TileEmpty: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
