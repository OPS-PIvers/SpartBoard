import { useCallback, useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';

export const useBoardsModalDnd = () => {
  const {
    moveBoardToCollection,
    addToast,
    collectionsApi: { moveCollection },
  } = useDashboard();
  const { t } = useTranslation();
  // Tracks the currently-dragged item id (e.g. 'board:abc' or
  // 'collection:xyz') so the parent can render a translucent ghost in
  // the DragOverlay. Cleared on drag end / cancel.
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Mouse: 15px movement to start drag (matches existing SidebarBoards).
  // Touch: 350ms hold (matches BoardCard long-press).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 15 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 350, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over) return;
      // Drag IDs encode type + id, e.g., 'board:abc' or 'collection:xyz'
      const [activeKind, activeId] = String(active.id).split(':');
      const [overKind, overId] = String(over.id).split(':');

      try {
        if (activeKind === 'board' && overKind === 'collection') {
          await moveBoardToCollection(
            activeId,
            overId === 'root' ? null : overId
          );
        } else if (activeKind === 'collection' && overKind === 'collection') {
          await moveCollection(activeId, overId === 'root' ? null : overId);
        }
      } catch (err) {
        // moveBoardToCollection already toasted; only surface collection-move
        // errors here. Collection move can fail for cycle/structural reasons
        // even before the Firestore write — those throw from the hook with a
        // descriptive message we can show directly.
        if (activeKind === 'collection') {
          const message =
            err instanceof Error
              ? err.message
              : t('boardsModal.dndFailed', {
                  defaultValue: 'Move failed — please retry',
                });
          addToast(message, 'error');
          logError('useBoardsModalDnd.moveCollection', err, {
            activeId,
            overId,
          });
        }
      }
    },
    [moveBoardToCollection, moveCollection, addToast, t]
  );

  return {
    sensors,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    activeDragId,
  };
};
