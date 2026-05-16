import { type FC, useMemo } from 'react';
import type { Dashboard, LiveSession, LiveStudent } from '@/types';
import { useMountedBoardCache } from '@/hooks/useMountedBoardCache';
import { BoardCanvas, type BoardCanvasProps } from './BoardCanvas';

export interface MountedBoardsLayerProps {
  activeId: string | null;
  dashboards: Dashboard[];
  isMinimized: boolean;
  animationClass: string;
  // Map of (boardId → LiveSession) so each canvas gets its own session
  // slot. Today only the active Board has a live session; passing it as a
  // map lets Plan 3 (Collection-sharing) add per-Board session pinning
  // later without changing this layer's shape.
  sessions?: Map<string, LiveSession>;
  students: LiveStudent[];
  emptyStudents: LiveStudent[];
  selectedWidgetId: string | null;
  zoom: number;
  globalStyle: BoardCanvasProps['globalStyle'];
  // Pass-through callbacks (typed via BoardCanvasProps at the call site)
  updateSessionConfig: BoardCanvasProps['updateSessionConfig'];
  updateSessionBackground: BoardCanvasProps['updateSessionBackground'];
  startSession: BoardCanvasProps['startSession'];
  endSession: BoardCanvasProps['endSession'];
  removeStudent: BoardCanvasProps['removeStudent'];
  toggleFreezeStudent: BoardCanvasProps['toggleFreezeStudent'];
  toggleGlobalFreeze: BoardCanvasProps['toggleGlobalFreeze'];
  updateWidget: BoardCanvasProps['updateWidget'];
  removeWidget: BoardCanvasProps['removeWidget'];
  duplicateWidget: BoardCanvasProps['duplicateWidget'];
  bringToFront: BoardCanvasProps['bringToFront'];
  addToast: BoardCanvasProps['addToast'];
  updateDashboardSettings: BoardCanvasProps['updateDashboardSettings'];
}

export const MountedBoardsLayer: FC<MountedBoardsLayerProps> = ({
  activeId,
  dashboards,
  isMinimized,
  animationClass,
  sessions,
  students,
  emptyStudents,
  selectedWidgetId,
  zoom,
  globalStyle,
  updateSessionConfig,
  updateSessionBackground,
  startSession,
  endSession,
  removeStudent,
  toggleFreezeStudent,
  toggleGlobalFreeze,
  updateWidget,
  removeWidget,
  duplicateWidget,
  bringToFront,
  addToast,
  updateDashboardSettings,
}) => {
  const pinnedIds = useMemo(() => {
    const s = new Set<string>();
    if (sessions) {
      for (const [boardId] of sessions) s.add(boardId);
    }
    return s;
  }, [sessions]);

  const mounted = useMountedBoardCache(activeId, dashboards, pinnedIds);

  return (
    <div className="relative w-full h-full">
      {mounted.map((db) => (
        <BoardCanvas
          key={db.id}
          dashboard={db}
          isActive={db.id === activeId}
          isMinimized={isMinimized}
          animationClass={animationClass}
          session={sessions?.get(db.id) ?? null}
          students={students}
          emptyStudents={emptyStudents}
          selectedWidgetId={selectedWidgetId}
          zoom={zoom}
          globalStyle={globalStyle}
          updateSessionConfig={updateSessionConfig}
          updateSessionBackground={updateSessionBackground}
          startSession={startSession}
          endSession={endSession}
          removeStudent={removeStudent}
          toggleFreezeStudent={toggleFreezeStudent}
          toggleGlobalFreeze={toggleGlobalFreeze}
          updateWidget={updateWidget}
          removeWidget={removeWidget}
          duplicateWidget={duplicateWidget}
          bringToFront={bringToFront}
          addToast={addToast}
          updateDashboardSettings={updateDashboardSettings}
        />
      ))}
    </div>
  );
};
