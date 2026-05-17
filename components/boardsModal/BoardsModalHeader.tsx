import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Plus,
  FolderPlus,
  LayoutTemplate,
  X,
  Trash2,
  FolderInput,
  Pin,
  PinOff,
} from 'lucide-react';

interface BoardsModalHeaderProps {
  search: string;
  onSearchChange: (next: string) => void;
  onCreateBoard: () => void;
  onCreateCollection: () => void;
  onCreateFromTemplate?: () => void;
  isSelectMode: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkMove: () => void;
  onBulkPin: () => void;
  onBulkUnpin: () => void;
}

export const BoardsModalHeader: React.FC<BoardsModalHeaderProps> = ({
  search,
  onSearchChange,
  onCreateBoard,
  onCreateCollection,
  onCreateFromTemplate,
  isSelectMode,
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkMove,
  onBulkPin,
  onBulkUnpin,
}) => {
  const { t } = useTranslation();

  if (isSelectMode) {
    return (
      <div className="h-14 px-4 border-b border-slate-200 bg-brand-blue-lighter/30 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClearSelection}
            aria-label={t('boardsModal.clearSelection', {
              defaultValue: 'Clear selection',
            })}
            className="p-2 hover:bg-white/40 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-700" />
          </button>
          <span className="text-sm font-bold text-slate-700">
            {t('boardsModal.selectedCount', {
              count: selectedCount,
              defaultValue: '{{count}} selected',
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBulkPin}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-white rounded-lg hover:bg-slate-100 transition"
          >
            <Pin className="w-3.5 h-3.5" />
            {t('boardsModal.pin', { defaultValue: 'Pin' })}
          </button>
          <button
            onClick={onBulkUnpin}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-white rounded-lg hover:bg-slate-100 transition"
          >
            <PinOff className="w-3.5 h-3.5" />
            {t('boardsModal.unpin', { defaultValue: 'Unpin' })}
          </button>
          <button
            onClick={onBulkMove}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-white rounded-lg hover:bg-slate-100 transition"
          >
            <FolderInput className="w-3.5 h-3.5" />
            {t('boardsModal.move', { defaultValue: 'Move…' })}
          </button>
          <button
            onClick={onBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white bg-brand-red-primary rounded-lg hover:bg-brand-red-dark transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('boardsModal.delete', { defaultValue: 'Delete' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-14 px-4 border-b border-slate-200 bg-white flex items-center gap-3 shrink-0">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('boardsModal.searchPlaceholder', {
            defaultValue: 'Search Boards & Collections',
          })}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:border-brand-blue-primary"
        />
      </div>
      <div className="flex items-center gap-2 ml-auto">
        {onCreateFromTemplate && (
          <button
            type="button"
            onClick={onCreateFromTemplate}
            className="flex items-center gap-1.5 px-3 py-2 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            {t('boardsModal.header.createFromTemplate', {
              defaultValue: '+ from Template',
            })}
          </button>
        )}
        <button
          onClick={onCreateCollection}
          className="flex items-center gap-1.5 px-3 py-2 text-xxs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          {t('boardsModal.newCollection', { defaultValue: 'New Collection' })}
        </button>
        <button
          onClick={onCreateBoard}
          className="flex items-center gap-1.5 px-3 py-2 text-xxs font-bold uppercase tracking-wider text-white bg-brand-blue-primary rounded-xl hover:bg-brand-blue-dark shadow-sm transition"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('boardsModal.newBoard', { defaultValue: 'New Board' })}
        </button>
      </div>
    </div>
  );
};
