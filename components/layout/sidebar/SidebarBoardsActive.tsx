import React from 'react';
import { useTranslation } from 'react-i18next';
import { Star, FolderOpen, Settings2 } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';

interface SidebarBoardsActiveProps {
  isVisible: boolean;
  onOpenModal: () => void;
}

export const SidebarBoardsActive: React.FC<SidebarBoardsActiveProps> = ({
  isVisible,
  onOpenModal,
}) => {
  const { t } = useTranslation();
  const { dashboards, activeDashboard, loadDashboard } = useDashboard();
  const { lastActiveCollectionId } = useAuth();

  // collectionId: null (root) is meaningful — only fall back when there's no active dashboard.
  const activeCollectionId = activeDashboard
    ? (activeDashboard.collectionId ?? null)
    : (lastActiveCollectionId ?? null);

  const boardsInActiveCollection = dashboards
    .filter((d) => (d.collectionId ?? null) === activeCollectionId)
    .slice(0, 6); // thin picker — modal handles the rest

  return (
    <div
      className={`absolute inset-0 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${
        isVisible
          ? 'translate-x-0 opacity-100 visible'
          : 'translate-x-full opacity-0 invisible'
      }`}
    >
      <div className="flex items-center gap-2 text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
        <FolderOpen className="w-3.5 h-3.5" />
        {activeCollectionId
          ? t('sidebar.boards.activeCollection', {
              defaultValue: 'Active Collection',
            })
          : t('sidebar.boards.rootBoards', { defaultValue: 'Boards' })}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {boardsInActiveCollection.map((db) => {
          const isActive = activeDashboard?.id === db.id;
          return (
            <button
              key={db.id}
              onClick={() => loadDashboard(db.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${
                isActive
                  ? 'bg-brand-blue-primary text-white'
                  : 'text-slate-700 hover:bg-brand-blue-lighter/40'
              }`}
            >
              {db.isDefault && (
                <Star
                  className={`w-3.5 h-3.5 flex-shrink-0 ${
                    isActive
                      ? 'fill-white text-white'
                      : 'fill-amber-400 text-amber-400'
                  }`}
                />
              )}
              <span className="truncate flex-1">{db.name}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenModal}
        className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xxs font-bold uppercase tracking-wider text-white bg-brand-blue-primary hover:bg-brand-blue-dark shadow-sm transition mt-auto"
      >
        <Settings2 className="w-4 h-4" />
        {t('sidebar.boards.manageAll', { defaultValue: 'Manage all boards' })}
      </button>
    </div>
  );
};
