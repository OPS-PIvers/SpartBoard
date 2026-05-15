import { useCallback } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useCollections } from '@/hooks/useCollections';

export const useBoardsModalDnd = () => {
  const { user } = useAuth();
  const { moveBoardToCollection } = useDashboard();
  const { moveCollection } = useCollections(user?.uid);

  // Mouse: 15px movement to start drag (matches existing SidebarBoards).
  // Touch: 350ms hold (matches BoardCard long-press).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 15 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 350, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      // Drag IDs encode type + id, e.g., 'board:abc' or 'collection:xyz'
      const [activeKind, activeId] = String(active.id).split(':');
      const [overKind, overId] = String(over.id).split(':');

      if (activeKind === 'board' && overKind === 'collection') {
        await moveBoardToCollection(
          activeId,
          overId === 'root' ? null : overId
        );
      } else if (activeKind === 'collection' && overKind === 'collection') {
        await moveCollection(activeId, overId === 'root' ? null : overId);
      }
    },
    [moveBoardToCollection, moveCollection]
  );

  return { sensors, handleDragEnd };
};
