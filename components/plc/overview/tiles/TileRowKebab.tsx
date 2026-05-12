/**
 * TileRowKebab — small 3-dot popover used inside PLC overview tile rows
 * (`QuizLibraryTile`, `VideoActivitiesTile`). Each row can expose 2-N
 * actions without committing the whole row click to one action.
 *
 * Visually compact: button is icon-only (~16px) so it fits in the tile's
 * tight type scale. The popover anchors below-right of the trigger and
 * uses standard click-outside dismissal.
 */

import React, { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

export interface TileRowKebabAction {
  id: string;
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  /** Stylistic only — destructive actions render in red. */
  destructive?: boolean;
  /** Disables the menu item; useful while a row-level mutation is in flight. */
  disabled?: boolean;
}

interface TileRowKebabProps {
  /** Localized aria-label for the kebab button itself. */
  ariaLabel: string;
  actions: TileRowKebabAction[];
}

export const TileRowKebab: React.FC<TileRowKebabProps> = ({
  ariaLabel,
  actions,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useClickOutside(popoverRef, () => setOpen(false), [triggerRef]);

  const handleTriggerClick = useCallback((e: React.MouseEvent) => {
    // Stop propagation so the parent row's click handler (which usually
    // navigates to the tab) doesn't fire when the user is opening the
    // menu.
    e.stopPropagation();
    setOpen((prev) => !prev);
  }, []);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleTriggerClick}
        className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 py-1"
        >
          {actions.length === 0 ? (
            <div className="px-3 py-1.5 text-xxs text-slate-400">
              {t('plcDashboard.overview.tiles.kebab.noActions', {
                defaultValue: 'No actions available',
              })}
            </div>
          ) : (
            actions.map((action) => {
              const Icon = action.Icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    action.onClick();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    action.destructive
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{action.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
