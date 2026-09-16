import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCardMenu } from './useCardMenu';
import {
  ExternalLink,
  Pencil,
  FolderInput,
  Palette,
  Share2,
  LayoutTemplate,
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
  canSaveAsTemplate: boolean;
  onSaveAsTemplate: () => void;
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
  canSaveAsTemplate,
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

  if (canSaveAsTemplate) {
    items.push({
      label: t('collectionMenu.saveAsTemplate', {
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
      className="fixed z-popover bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[200px]"
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
    </div>
  );
};
