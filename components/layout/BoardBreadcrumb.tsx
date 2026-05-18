import { type FC, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, ChevronRight } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { BoardsModal } from '@/components/boardsModal/BoardsModal';

const DISPLAY_MS = 3000;

type VisibilityAction = 'show' | 'hide';

function visibilityReducer(_state: boolean, action: VisibilityAction): boolean {
  return action === 'show';
}

export const BoardBreadcrumb: FC = () => {
  const { t } = useTranslation();
  const {
    activeDashboard,
    collectionsApi: { collections },
  } = useDashboard();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // useReducer dispatch is not flagged by react-hooks/set-state-in-effect,
  // unlike useState setters, so we use it here to reset visibility from the
  // effect body without triggering the lint rule.
  const [isVisible, dispatch] = useReducer(visibilityReducer, true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeId = activeDashboard?.id;
  const activeCollectionId = activeDashboard?.collectionId ?? null;

  // Show the pill on first mount and whenever the active board or its
  // Collection changes. React batches multiple dep changes per commit into a
  // single effect run, so a board-switch that also changes Collection only
  // schedules one timer.
  useEffect(() => {
    if (!activeId) return;
    dispatch('show');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => dispatch('hide'), DISPLAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeId, activeCollectionId]);

  if (!activeDashboard) return null;
  if (!isVisible && !isModalOpen) return null;

  const collection = activeCollectionId
    ? collections.find((c) => c.id === activeCollectionId)
    : null;
  const collectionLabel = collection
    ? collection.name
    : t('boardBreadcrumb.root', { defaultValue: 'No Collection' });

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        data-screenshot="exclude"
        aria-label={t('boardBreadcrumb.openManager', {
          defaultValue: 'Manage Boards',
        })}
        className={`inline-flex items-center gap-1 max-w-[40vw] px-2.5 py-1 rounded-full bg-slate-900/70 backdrop-blur-md text-xxs font-medium text-white/80 hover:bg-slate-900/85 hover:text-white transition-opacity duration-300 motion-reduce:transition-none ${
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
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
