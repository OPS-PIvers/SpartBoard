/**
 * SubBoardCanvas — renders the substitute board's widgets at their real
 * positions through the existing WidgetRenderer pipeline. Reads everything
 * from useDashboard(), which is supplied by SubsDashboardProvider.
 *
 * Layout: an absolutely-positioned canvas sized to the teacher's saved
 * viewport (or widget bounds, whichever is larger). The canvas is then
 * `transform: scale()`-fit to the sub's viewport so boards built on a
 * projector display fit on a Chromebook without widgets disappearing off
 * the right or bottom edge. A small floor (`MIN_FIT_SCALE`) keeps content
 * legible on very small screens — sub can scroll if the floor kicks in.
 */

import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useWindowSize } from '@/hooks/useWindowSize';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { StickerItemWidget } from '@/components/widgets/stickers/StickerItemWidget';
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
  type WidgetData,
} from '@/types';

/**
 * Height (px) reserved at the top of the canvas for the SubProfileToolbar.
 * Must stay in sync with SubBoardScreen's `<main className="... pt-20">`
 * (Tailwind `pt-20` = 5rem = 80px).
 */
const TOOLBAR_RESERVED_HEIGHT_PX = 80;

/**
 * Minimum legible scale. Boards with very wide layouts on small viewports
 * can compute a fit-scale below this; clamp so widgets stay readable
 * (sub can scroll inside the canvas to see the rest).
 */
const MIN_FIT_SCALE = 0.4;

const EMPTY_STUDENTS: LiveStudent[] = [];

/**
 * Read-only sticker renderer for the substitute view. DraggableSticker owns
 * all positioning (position:absolute, left/top/width/height/zIndex/transform),
 * so we just wrap in pointer-events:none to block all drag/resize/context-menu
 * interactions. No re-applying coordinates here — that was the double-positioning bug.
 */
export const ReadOnlySticker: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => (
  <div data-testid="readonly-sticker-wrapper" style={{ pointerEvents: 'none' }}>
    <StickerItemWidget widget={widget} />
  </div>
);

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
  const { width: viewportW, height: viewportH } = useWindowSize();
  const active = dashboard.activeDashboard;
  if (!active) return null;

  const background = active.background ?? '';
  const isCustom = isCustomBackground(background);
  const isExternal = isExternalBackground(background);
  const customBgStyle = isCustom
    ? getCustomBackgroundStyle(background)
    : undefined;

  const globalStyle = active.globalStyle ?? DEFAULT_GLOBAL_STYLE;

  // Compute the canvas's natural size. Prefer the teacher's saved viewport
  // (`viewportWidth` / `viewportHeight`) so the board renders in the same
  // logical space the teacher arranged in — otherwise widgets that span the
  // teacher's screen edge would look cropped. Fall back to widget bounds
  // for legacy shares that didn't capture viewport dimensions.
  const widgetBoundsW = active.widgets.reduce(
    (acc, w) => Math.max(acc, (w.x ?? 0) + (w.w ?? 0)),
    0
  );
  const widgetBoundsH = active.widgets.reduce(
    (acc, w) => Math.max(acc, (w.y ?? 0) + (w.h ?? 0)),
    0
  );
  const canvasW = Math.max(active.viewportWidth ?? 0, widgetBoundsW, 1200);
  const canvasH = Math.max(active.viewportHeight ?? 0, widgetBoundsH, 800);

  // Fit-scale the canvas to the sub's viewport. The board was likely
  // arranged on a projector / large monitor; subs may load it on a
  // Chromebook. Without this, widgets near the right or bottom edge
  // land off-screen with no visible cue.
  const availableW = viewportW > 0 ? viewportW : canvasW;
  const availableH =
    viewportH > 0
      ? Math.max(0, viewportH - TOOLBAR_RESERVED_HEIGHT_PX)
      : canvasH;
  const rawFitScale = Math.min(availableW / canvasW, availableH / canvasH);
  const fitScale = Math.max(
    MIN_FIT_SCALE,
    Math.min(1, Number.isFinite(rawFitScale) ? rawFitScale : 1)
  );

  // Sanitize external background URLs — strip characters that could break or
  // inject into the CSS url("...") value (double-quote, single-quote,
  // backslash, and bare newlines are the only vectors inside a CSS string).
  const safeBackgroundUrl = isExternal
    ? background.replace(/["'\\\n\r]/g, '')
    : '';

  const outerStyle: React.CSSProperties | undefined = isCustom
    ? customBgStyle
    : isExternal
      ? {
          backgroundImage: `url("${safeBackgroundUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
      : undefined;

  // Outer container holds the background and clips the (potentially scaled)
  // canvas. We size it to the SCALED canvas dimensions so the page doesn't
  // gain unwanted horizontal scrollbars from the unscaled positioned div
  // underneath. `minWidth/minHeight: 100%` makes the background still cover
  // the toolbar-less area when the canvas is smaller than the viewport.
  const scaledW = canvasW * fitScale;
  const scaledH = canvasH * fitScale;

  return (
    <div className="absolute inset-0 overflow-auto" style={outerStyle}>
      <div
        className={
          !isCustom && !isExternal && background ? background : undefined
        }
        style={{
          position: 'relative',
          width: scaledW,
          height: scaledH,
          minWidth: '100%',
          minHeight: '100%',
        }}
      >
        <div
          // Inner positioned plane: laid out at the teacher's original
          // logical dimensions, then scaled to fit the sub's viewport.
          // transform-origin: top-left so widget coords map 1:1 from
          // teacher space into the scaled space.
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: canvasW,
            height: canvasH,
            transform: fitScale === 1 ? undefined : `scale(${fitScale})`,
            transformOrigin: 'top left',
          }}
        >
          {active.widgets.map((widget) =>
            widget.type === 'sticker' ? (
              // Stickers bypass DraggableWindow entirely (WidgetRenderer
              // short-circuits for them). Render a read-only positional shell
              // so subs can see stickers without gaining drag/resize affordances.
              <ReadOnlySticker
                key={`${widget.id}-${resetKey}`}
                widget={widget}
              />
            ) : (
              // Non-sticker widgets: DraggableWindow already applies
              // position:absolute with widget.x / widget.y / widget.w / widget.h
              // from the widget prop, so NO wrapper div is needed here.
              // isActiveBoardReadOnly:true (set in SubsDashboardProvider) locks
              // the chrome (no drag/resize/close/flip) automatically.
              <WidgetRenderer
                key={`${widget.id}-${resetKey}`}
                widget={widget}
                isLive={NO_LIVE_SESSION.isLive}
                students={NO_LIVE_SESSION.students}
                sessionCode={NO_LIVE_SESSION.sessionCode}
                isGlobalFrozen={NO_LIVE_SESSION.isGlobalFrozen}
                updateSessionConfig={NO_LIVE_SESSION.updateSessionConfig}
                updateSessionBackground={
                  NO_LIVE_SESSION.updateSessionBackground
                }
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
            )
          )}
        </div>
      </div>
    </div>
  );
};
