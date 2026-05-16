import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  Pencil,
  FolderInput,
  Palette,
  Share2,
  Trash2,
} from 'lucide-react';

interface CollectionContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onColor: () => void;
  canShare: boolean;
  onShare: () => void;
  onDelete: () => void;
}

export const CollectionContextMenu: React.FC<CollectionContextMenuProps> = ({
  position,
  onClose,
  onOpen,
  onRename,
  onMove,
  onColor,
  canShare,
  onShare,
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
      label: t('boardsModal.menu.openCollection', { defaultValue: 'Open' }),
      icon: ExternalLink,
      action: onOpen,
    },
    {
      label: t('boardsModal.menu.rename', { defaultValue: 'Rename' }),
      icon: Pencil,
      action: onRename,
    },
    {
      label: t('boardsModal.menu.move', { defaultValue: 'Move to…' }),
      icon: FolderInput,
      action: onMove,
    },
    {
      label: t('boardsModal.menu.color', { defaultValue: 'Set color' }),
      icon: Palette,
      action: onColor,
    },
  ];

  if (canShare) {
    items.push({
      label: t('collectionMenu.share', { defaultValue: 'Share Collection…' }),
      icon: Share2,
      action: onShare,
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
      className="fixed z-popover bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[200px]"
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
