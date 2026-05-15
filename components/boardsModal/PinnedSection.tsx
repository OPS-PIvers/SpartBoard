import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pin } from 'lucide-react';
import type { Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';

interface PinnedSectionProps {
  pinnedBoards: Dashboard[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
}

export const PinnedSection: React.FC<PinnedSectionProps> = ({
  pinnedBoards,
  selectedCollectionId: _selectedCollectionId,
  onSelectCollection: _onSelectCollection,
}) => {
  const { t } = useTranslation();
  const { unpinBoard, loadDashboard } = useDashboard();

  return (
    <div className="px-2 pt-3 pb-2 border-b border-slate-100">
      <div className="flex items-center gap-1.5 px-2 mb-1.5">
        <Pin className="w-3 h-3 text-amber-500" />
        <span className="text-xxs font-bold text-slate-500 uppercase tracking-widest">
          {t('boardsModal.pinned', { defaultValue: 'Pinned' })}
        </span>
        <span className="ml-auto text-xxs text-slate-400">
          {pinnedBoards.length}
        </span>
      </div>

      {pinnedBoards.length === 0 ? (
        <div className="px-2 py-3 text-xxs text-slate-400 italic">
          {t('boardsModal.pinnedEmpty', {
            defaultValue: 'Pin Boards to keep them one tap away',
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {pinnedBoards.map((b) => (
            <div
              key={b.id}
              className="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <button
                onClick={() => loadDashboard(b.id)}
                className="flex-1 truncate text-left"
              >
                {b.name}
              </button>
              <button
                onClick={() => void unpinBoard(b.id)}
                aria-label={t('boardsModal.unpinBoard', {
                  defaultValue: 'Unpin Board',
                })}
                className="p-0.5 rounded text-amber-500 opacity-0 group-hover:opacity-100 hover:bg-amber-100 transition"
              >
                <Pin className="w-3 h-3 fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
