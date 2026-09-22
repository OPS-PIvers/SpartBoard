import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCardMenu } from './useCardMenu';
import {
  ExternalLink,
  Pencil,
  Copy,
  Star,
  Pin,
  PinOff,
  FolderInput,
  Share2,
  UserCheck,
  LayoutTemplate,
  Trash2,
} from 'lucide-react';
import type { Dashboard } from '@/types';

interface BoardContextMenuProps {
  board: Dashboard;
  position: { x: number; y: number };
  canShare: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onTogglePin: () => void;
  onMove: () => void;
  onShare: () => void;
  onShareWithSub: () => void;
  /** When this board/collection is already shared with a sub: its end time. */
  subShareEndsAt?: number | null;
  onSaveAsTemplate: () => void;
  onDelete: () => void;
}

export const BoardContextMenu: React.FC<BoardContextMenuProps> = ({
  board,
  position,
  canShare,
  isAdmin,
  onClose,
  onOpen,
  onRename,
  onDuplicate,
  onSetDefault,
  onTogglePin,
  onMove,
  onShare,
  onShareWithSub,
  subShareEndsAt,
  onSaveAsTemplate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { menuRef, style, onKeyDown } = useCardMenu(position, onClose);

  type Item = {
    label: string;
    icon: typeof ExternalLink;
    action: () => void;
    danger?: boolean;
  };

  const items: Item[] = [
    {
      label: t('boardsModal.menu.open', { defaultValue: 'Open' }),
      icon: ExternalLink,
      action: onOpen,
    },
    {
      label: t('boardsModal.menu.rename', { defaultValue: 'Rename' }),
      icon: Pencil,
      action: onRename,
    },
    {
      label: t('boardsModal.menu.duplicate', {
        defaultValue: 'Duplicate (fresh)',
      }),
      icon: Copy,
      action: onDuplicate,
    },
    {
      label: t('boardsModal.menu.setDefault', {
        defaultValue: 'Set as default in this Collection',
      }),
      icon: Star,
      action: onSetDefault,
    },
    {
      label: board.isPinned
        ? t('boardsModal.menu.unpin', { defaultValue: 'Unpin' })
        : t('boardsModal.menu.pin', { defaultValue: 'Pin' }),
      icon: board.isPinned ? PinOff : Pin,
      action: onTogglePin,
    },
    {
      label: t('boardsModal.menu.move', { defaultValue: 'Move to…' }),
      icon: FolderInput,
      action: onMove,
    },
  ];

  if (canShare) {
    items.push({
      label: t('boardsModal.menu.share', { defaultValue: 'Share…' }),
      icon: Share2,
      action: onShare,
    });
  }

  if (canShare) {
    items.push({
      label: subShareEndsAt
        ? t('subShare.menu.update', { defaultValue: 'Update sub share…' })
        : t('subShare.menu.share', { defaultValue: 'Share with a sub…' }),
      icon: UserCheck,
      action: onShareWithSub,
    });
  }

  if (isAdmin) {
    items.push({
      label: t('boardsModal.menu.saveAsTemplate', {
        defaultValue: 'Save as Template…',
      }),
      icon: LayoutTemplate,
      action: onSaveAsTemplate,
    });
  }

  items.push({
    label: t('boardsModal.menu.delete', { defaultValue: 'Delete' }),
    icon: Trash2,
    action: onDelete,
    danger: true,
  });

  return (
    <div
      ref={menuRef}
      className="fixed z-popover bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
      style={style}
      role="menu"
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={i}
            onClick={() => {
              item.action();
              onClose();
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors focus-visible:outline-none ${
              item.danger
                ? 'text-brand-red-primary hover:bg-brand-red-primary/10 focus-visible:bg-brand-red-primary/10'
                : 'text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100'
            }`}
            role="menuitem"
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </button>
        );
      })}
      {subShareEndsAt !== undefined && subShareEndsAt !== null && (
        <p className="border-t border-slate-100 mt-1 px-3 pt-2 pb-1 text-[11px] text-slate-500">
          {t('subShare.menu.sharedUntil', {
            date: new Date(subShareEndsAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }),
            defaultValue: 'Shared with a sub until {{date}}',
          })}
        </p>
      )}
    </div>
  );
};
