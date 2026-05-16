import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  Pencil,
  Copy,
  Star,
  Pin,
  PinOff,
  FolderInput,
  Share2,
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
  onSaveAsTemplate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

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
      style={{ top: position.y, left: position.x }}
      role="menu"
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
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
              item.danger
                ? 'text-brand-red-primary hover:bg-brand-red-primary/10'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
            role="menuitem"
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
};
