import { type FC, memo } from 'react';
import type {
  Dashboard,
  LiveSession,
  LiveStudent,
  WidgetData,
  WidgetConfig,
  WidgetType,
  DashboardSettings,
} from '@/types';
import { DEFAULT_GLOBAL_STYLE } from '@/types';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { GroupBoundingBox } from '@/components/common/GroupBoundingBox';

export interface BoardCanvasProps {
  dashboard: Dashboard;
  isActive: boolean;
  isMinimized: boolean;
  animationClass: string;
  // Live-session bundle. `null` when no session is active on this Board.
  session: LiveSession | null;
  students: LiveStudent[];
  emptyStudents: LiveStudent[];
  selectedWidgetId: string | null;
  zoom: number;
  // Pass-through callbacks: same shape WidgetRenderer expects.
  updateSessionConfig: (config: WidgetConfig) => Promise<void>;
  updateSessionBackground: (background: string) => Promise<void>;
  startSession: (
    widgetId: string,
    widgetType: WidgetType,
    config?: WidgetConfig,
    background?: string
  ) => Promise<LiveSession>;
  endSession: () => Promise<void>;
  removeStudent: (studentId: string) => Promise<void>;
  toggleFreezeStudent: (
    studentId: string,
    currentStatus: 'active' | 'frozen' | 'disconnected'
  ) => Promise<void>;
  toggleGlobalFreeze: (freeze: boolean) => Promise<void>;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  removeWidget: (id: string) => void;
  duplicateWidget: (id: string) => void;
  bringToFront: (id: string) => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  updateDashboardSettings?: (updates: Partial<DashboardSettings>) => void;
}

/**
 * Renders a single Board's widget canvas. Visibility is controlled by the
 * `isActive` flag: inactive boards render with `display: none` so React
 * state (timer counts, drawings in flight, video positions) is preserved
 * across Board switches via the parent's MountedBoardsLayer LRU window.
 *
 * The callback signatures mirror WidgetRenderer's prop interface exactly so
 * values are forwarded verbatim — this component is a structural extraction,
 * not a place to enforce stricter callback types.
 */
export const BoardCanvas: FC<BoardCanvasProps> = memo(
  ({
    dashboard,
    isActive,
    isMinimized,
    animationClass,
    session,
    students,
    emptyStudents,
    selectedWidgetId,
    zoom,
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
    // Each Board resolves its own globalStyle so hidden boards don't inherit
    // the active Board's styling when widget memoization is evaluated.
    const globalStyle = dashboard.globalStyle ?? DEFAULT_GLOBAL_STYLE;

    const selectedGroupId = selectedWidgetId
      ? dashboard.widgets.find((w) => w.id === selectedWidgetId)?.groupId
      : undefined;

    const groupMembers = selectedGroupId
      ? dashboard.widgets.filter(
          (w) =>
            w.groupId === selectedGroupId &&
            !w.minimized &&
            !w.isLocked &&
            !w.isPinned
        )
      : [];

    return (
      <div
        className={`absolute inset-0 ${animationClass} transition-opacity duration-500 ease-in-out`}
        style={{
          // Note: transform and opacity transitions here create CSS stacking
          // contexts. Spotlighted widgets escape this by portaling to document.body.
          display: isActive ? 'block' : 'none',
          transform: isMinimized && isActive ? 'translateY(80vh)' : undefined,
          transformOrigin: isMinimized ? 'bottom center' : 'center center',
          opacity: isMinimized && isActive ? 0 : 1,
          pointerEvents: isMinimized && isActive ? 'none' : 'auto',
        }}
        aria-hidden={!isActive}
        data-board-id={dashboard.id}
      >
        {dashboard.widgets.map((widget) => {
          const isLive =
            session?.isActive === true && session.activeWidgetId === widget.id;
          return (
            <WidgetRenderer
              key={widget.id}
              widget={widget}
              isActive={isActive}
              isStudentView={false}
              sessionCode={session?.code}
              isGlobalFrozen={session?.frozen ?? false}
              isLive={isLive}
              students={isLive ? students : emptyStudents}
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
              globalStyle={globalStyle}
              dashboardBackground={dashboard.background}
              dashboardSettings={dashboard.settings}
              updateDashboardSettings={updateDashboardSettings}
            />
          );
        })}
        {/* Group Bounding Box — rendered when a grouped widget is selected */}
        {selectedGroupId && groupMembers.length > 0 && (
          <GroupBoundingBox groupWidgets={groupMembers} zoom={zoom} />
        )}
      </div>
    );
  }
);

BoardCanvas.displayName = 'BoardCanvas';
