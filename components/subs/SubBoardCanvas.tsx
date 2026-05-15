/**
 * SubBoardCanvas — renders the substitute board's widgets at their real
 * positions through the existing WidgetRenderer pipeline. Reads everything
 * from useDashboard(), which is supplied by SubsDashboardProvider.
 *
 * Layout: an absolutely-positioned canvas the size of the teacher's
 * original board. Sub may scroll if their viewport is smaller (viewport-
 * fit is a planned follow-up, intentionally not in this PR).
 */

import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import {
  isExternalBackground,
  isCustomBackground,
  getCustomBackgroundStyle,
} from '@/utils/backgrounds';
import {
  DEFAULT_GLOBAL_STYLE,
  type LiveStudent,
  type LiveSession,
  type WidgetConfig,
  type WidgetType,
} from '@/types';

const EMPTY_STUDENTS: LiveStudent[] = [];

const NO_LIVE_SESSION = {
  isLive: false,
  students: EMPTY_STUDENTS,
  sessionCode: undefined as string | undefined,
  isGlobalFrozen: false,
  updateSessionConfig: (_config: WidgetConfig): Promise<void> =>
    Promise.resolve(),
  updateSessionBackground: (_bg: string): Promise<void> => Promise.resolve(),
  startSession: (
    _widgetId: string,
    _widgetType: WidgetType,
    _config?: WidgetConfig,
    _background?: string
  ): Promise<LiveSession> =>
    Promise.reject(
      new Error('Live sessions are disabled in the substitute view')
    ),
  endSession: (): Promise<void> => Promise.resolve(),
  removeStudent: (_studentId: string): Promise<void> => Promise.resolve(),
  toggleFreezeStudent: (
    _studentId: string,
    _currentStatus: 'active' | 'frozen' | 'disconnected'
  ): Promise<void> => Promise.resolve(),
  toggleGlobalFreeze: (_freeze: boolean): Promise<void> => Promise.resolve(),
};

interface SubBoardCanvasProps {
  /**
   * Bumped on reset by SubsDashboardProvider so passing it as `key` on
   * the widget wrapper re-mounts every widget — wiping component-local
   * state (Timer running flags, Music playing state, etc.) along with
   * the widgets-array reset.
   */
  resetKey: number;
}

export const SubBoardCanvas: React.FC<SubBoardCanvasProps> = ({ resetKey }) => {
  const dashboard = useDashboard();
  const active = dashboard.activeDashboard;
  if (!active) return null;

  const background = active.background ?? '';
  const isCustom = isCustomBackground(background);
  const isExternal = isExternalBackground(background);
  const customBgStyle = isCustom
    ? getCustomBackgroundStyle(background)
    : undefined;

  const globalStyle = active.globalStyle ?? DEFAULT_GLOBAL_STYLE;

  // Compute canvas bounds from the rightmost/bottommost widget edges so
  // the absolute-positioned widgets all land inside a sized container.
  const canvasW = active.widgets.reduce(
    (acc, w) => Math.max(acc, (w.x ?? 0) + (w.w ?? 0)),
    1200
  );
  const canvasH = active.widgets.reduce(
    (acc, w) => Math.max(acc, (w.y ?? 0) + (w.h ?? 0)),
    800
  );

  const outerStyle: React.CSSProperties | undefined = isCustom
    ? customBgStyle
    : isExternal
      ? {
          backgroundImage: `url("${background}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
      : undefined;

  return (
    <div className="absolute inset-0 overflow-auto" style={outerStyle}>
      <div
        className={
          !isCustom && !isExternal && background ? background : undefined
        }
        style={{
          position: 'relative',
          width: canvasW,
          height: canvasH,
          minWidth: '100%',
          minHeight: '100%',
        }}
      >
        {active.widgets.map((widget) => (
          <div
            key={`${widget.id}-${resetKey}`}
            style={{
              position: 'absolute',
              left: widget.x,
              top: widget.y,
              width: widget.w,
              height: widget.h,
              zIndex: widget.z ?? 1,
            }}
          >
            <WidgetRenderer
              widget={widget}
              isLive={NO_LIVE_SESSION.isLive}
              students={NO_LIVE_SESSION.students}
              sessionCode={NO_LIVE_SESSION.sessionCode}
              isGlobalFrozen={NO_LIVE_SESSION.isGlobalFrozen}
              updateSessionConfig={NO_LIVE_SESSION.updateSessionConfig}
              updateSessionBackground={NO_LIVE_SESSION.updateSessionBackground}
              startSession={NO_LIVE_SESSION.startSession}
              endSession={NO_LIVE_SESSION.endSession}
              removeStudent={NO_LIVE_SESSION.removeStudent}
              toggleFreezeStudent={NO_LIVE_SESSION.toggleFreezeStudent}
              toggleGlobalFreeze={NO_LIVE_SESSION.toggleGlobalFreeze}
              updateWidget={dashboard.updateWidget}
              removeWidget={dashboard.removeWidget}
              duplicateWidget={dashboard.duplicateWidget}
              bringToFront={dashboard.bringToFront}
              addToast={dashboard.addToast}
              globalStyle={globalStyle}
              dashboardBackground={background}
              dashboardSettings={active.settings}
              updateDashboardSettings={dashboard.updateDashboardSettings}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
