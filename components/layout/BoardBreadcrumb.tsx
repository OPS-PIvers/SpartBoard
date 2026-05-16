import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, ChevronRight } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { BoardsModal } from '@/components/boardsModal/BoardsModal';

export const BoardBreadcrumb: FC = () => {
  const { t } = useTranslation();
  const {
    activeDashboard,
    collectionsApi: { collections },
  } = useDashboard();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!activeDashboard) return null;
  const collectionId = activeDashboard.collectionId ?? null;
  const collection = collectionId
    ? collections.find((c) => c.id === collectionId)
    : null;
  const collectionLabel = collection
    ? collection.name
    : t('boardBreadcrumb.root', { defaultValue: 'All Boards' });

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        data-screenshot="exclude"
        aria-label={t('boardBreadcrumb.openManager', {
          defaultValue: 'Manage Boards',
        })}
        className="inline-flex items-center gap-1 max-w-[40vw] px-2.5 py-1 rounded-full bg-slate-900/70 backdrop-blur-md text-xxs font-medium text-white/80 hover:bg-slate-900/85 hover:text-white transition-colors"
      >
        <Folder
          className="w-3 h-3 flex-shrink-0"
          style={collection?.color ? { color: collection.color } : undefined}
        />
        <span className="truncate">{collectionLabel}</span>
        <ChevronRight className="w-3 h-3 flex-shrink-0 text-white/40" />
        <span className="truncate font-bold text-white">
          {activeDashboard.name}
        </span>
      </button>
      {isModalOpen && <BoardsModal onClose={() => setIsModalOpen(false)} />}
    </>
  );
};
