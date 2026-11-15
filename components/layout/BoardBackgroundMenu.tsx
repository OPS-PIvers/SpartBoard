import React from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { useCardMenu } from '@/components/boardsModal/useCardMenu';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

export interface BoardMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  tour: TourAnchorAttrs;
  action: () => void;
  shortcut?: string;
  disabled?: boolean;
  /** Starts a new group with a hairline above it. */
  groupStart?: boolean;
}

interface BoardBackgroundMenuProps {
  position: { x: number; y: number };
  items: BoardMenuItem[];
  onClose: () => void;
}

/** Right-click menu on the board background; the host decides which items show. */
export const BoardBackgroundMenu: React.FC<BoardBackgroundMenuProps> = ({
  position,
  items,
  onClose,
}) => {
  const { t } = useTranslation();
  const { menuRef, style, onKeyDown } = useCardMenu(position, onClose);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t('boardMenu.ariaLabel', { defaultValue: 'Board options' })}
      className="fixed z-popover bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[220px] font-sans animate-in fade-in zoom-in-95 duration-100"
      style={style}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <React.Fragment key={item.id}>
            {item.groupStart && i > 0 && (
              <div
                role="separator"
                className="my-1 border-t border-slate-100"
              />
            )}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.action();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 touch:py-3 text-sm text-left text-slate-700 transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-hidden disabled:text-slate-400 disabled:hover:bg-transparent disabled:cursor-default"
              {...item.tour}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="ml-6 text-xs text-slate-400">
                  {item.shortcut}
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};
