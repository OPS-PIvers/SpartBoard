import React, { useId, useState } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { tourAttr } from '@/config/tourAnchors';

interface CollapsibleSectionProps {
  label: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  /** Optional inline text shown next to the label in BOTH states (e.g. a collapsed-state summary). */
  summary?: React.ReactNode;
  children: React.ReactNode;
  /** Live-tour anchor attrs from `tourAttr`. */
  anchor?: ReturnType<typeof tourAttr>;
}

/**
 * Collapsible group with a Tab-Switch-Detection-style header row and a
 * hairline top divider. Used inside the assign dialogs to fold secondary
 * settings groups (Answer Feedback, Gamification) under prominent
 * section labels — children inside the section visually demote (callers
 * pass `compact` to their `ToggleRow`s so the labels render in the
 * small uppercase tracking-widest style).
 *
 * The header button uses `aria-controls` + `aria-expanded` paired with an
 * `id` on the disclosed region so assistive tech announces the
 * relationship and the open/closed state — matches the WAI-ARIA
 * disclosure pattern.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  label,
  icon: Icon,
  defaultOpen = false,
  summary,
  children,
  anchor,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  return (
    <div className="border-t border-slate-200/70 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={regionId}
        {...anchor}
        className="group flex w-full items-center justify-between gap-2 rounded-md py-1 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex items-center gap-2 text-sm font-bold text-brand-blue-dark shrink-0">
            {Icon && (
              <Icon
                aria-hidden="true"
                className="w-4 h-4 text-brand-blue-primary"
              />
            )}
            {label}
          </span>
          {summary && (
            <span className="text-xs text-slate-500 truncate">{summary}</span>
          )}
        </span>
        <ChevronRight
          className={`w-4 h-4 text-slate-400 group-hover:text-brand-blue-primary transition-all ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <div id={regionId} className="space-y-3 pt-2 pl-1">
          {children}
        </div>
      )}
    </div>
  );
};
