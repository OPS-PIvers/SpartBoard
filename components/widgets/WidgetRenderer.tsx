import React, { memo, Suspense, useMemo, useCallback } from 'react';
import { Z_INDEX } from '@/config/zIndex';
import {
  WidgetData,
  WidgetConfig,
  LiveStudent,
  LiveSession,
  GlobalStyle,
  WidgetType,
  DashboardSettings,
} from '@/types';
import { DraggableWindow } from '../common/DraggableWindow';
import { LiveControl } from './LiveControl';
import { StickerItemWidget } from './stickers/StickerItemWidget';
import { getTitle } from '@/utils/widgetHelpers';
import { getJoinUrl } from '@/utils/urlHelpers';
import { ScalableWidget } from '../common/ScalableWidget';
import { WidgetLayoutWrapper } from '@/components/widgets/WidgetLayout';
import { useWindowSize } from '@/hooks/useWindowSize';
import { useAuth } from '@/context/useAuth';
import { UI_CONSTANTS } from '@/config/layout';
import {
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SCALING_CONFIG,
  DEFAULT_SCALING_CONFIG,
} from './WidgetRegistry';

// Widgets that require real-time position updates for inter-widget functionality
const POSITION_AWARE_WIDGETS: WidgetType[] = [
  'catalyst',
  'catalyst-instruction',
  'catalyst-visual',
];

const LIVE_SESSION_UPDATE_DEBOUNCE_MS = 800; // Balance between real-time updates and reducing Firestore write costs

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full w-full">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

interface WidgetRendererProps {
  widget: WidgetData;
  isStudentView?: boolean;
  studentPin?: string | null;
  // Session Props
  sessionCode?: string;
  isGlobalFrozen?: boolean;
  isLive: boolean;
  students: LiveStudent[];
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
  // Dashboard Actions
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
  removeWidget: (id: string) => void;
  duplicateWidget: (id: string) => void;
  bringToFront: (id: string) => void;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  globalStyle: GlobalStyle;
  dashboardBackground?: string;
  dashboardSettings?: DashboardSettings;
  updateDashboardSettings?: (updates: Partial<DashboardSettings>) => void;
}

const WidgetRendererComponent: React.FC<WidgetRendererProps> = ({
  widget,
  isStudentView = false,
  studentPin,
  sessionCode,
  isGlobalFrozen = false,
  isLive,
  students,
  updateSessionConfig,
  updateSessionBackground,
  startSession,
  endSession,
  removeStudent,
  toggleFreezeStudent,
  toggleGlobalFreeze,
  globalStyle,
  dashboardBackground,
  dashboardSettings,
}) => {
  const isSpotlighted = dashboardSettings?.spotlightWidgetId === widget.id;
  const windowSize = useWindowSize(!!widget.maximized);
  const {
    canAccessFeature,
    featurePermissions,
    disableCloseConfirmation: accountDisableCloseConfirmation,
  } = useAuth();

  const handleToggleLive = async () => {
    try {
      if (isLive) {
        await endSession();
      } else {
        await startSession(
          widget.id,
          widget.type,
          widget.config,
          dashboardBackground ?? undefined
        );
      }
    } catch (error) {
      console.error('Failed to toggle live session:', error);
    }
  };

  // Sync config changes to session when live
  // ⚡ BOLT OPTIMIZATION: Only serialize when config reference changes AND session is live to avoid expensive JSON.stringify on every drag/render
  const configJson = useMemo(
    () => (isLive ? JSON.stringify(widget.config) : null),
    [widget.config, isLive]
  );
  React.useEffect(() => {
    if (!isLive || !configJson) {
      return undefined;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          await updateSessionConfig(JSON.parse(configJson) as WidgetConfig);
        } catch (error) {
          console.error('Failed to update live session config', error);
        }
      })();
    }, LIVE_SESSION_UPDATE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [configJson, isLive, updateSessionConfig]);

  // Sync background changes to session when live
  React.useEffect(() => {
    if (!isLive || !dashboardBackground) {
      return;
    }
    void updateSessionBackground(dashboardBackground);
  }, [dashboardBackground, isLive, updateSessionBackground]);

  const SettingsComponent = WIDGET_SETTINGS_COMPONENTS[widget.type];
  const AppearanceComponent = WIDGET_APPEARANCE_COMPONENTS[widget.type];

  const getWidgetSettings = () => {
    if (SettingsComponent) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <SettingsComponent widget={widget} />
        </Suspense>
      );
    }
    return (
      <div className="text-slate-500 italic text-sm">
        Standard settings available.
      </div>
    );
  };

  const getWidgetAppearanceSettings = () => {
    if (AppearanceComponent) {
      return (
        <Suspense fallback={<LoadingFallback />}>
          <AppearanceComponent widget={widget} />
        </Suspense>
      );
    }
    return null;
  };

  // When spotlighted we switch to position:fixed so the element escapes all
  // parent stacking contexts (will-change:transform / container-type:size on
  // DraggableWindow both create stacking contexts that would otherwise trap
  // the widget below the backdrop overlay). position:fixed is relative to the
  // viewport, and the dashboard is always full-screen, so widget.x / widget.y
  // map 1:1 to viewport coordinates — the widget stays visually in place.
  const customStyle: React.CSSProperties = isSpotlighted
    ? {
        position: 'fixed',
        zIndex: Z_INDEX.backdrop + 1,
        outline: '3px solid #facc15', // yellow-400 ring
        outlineOffset: '2px',
        boxShadow: '0 0 32px 8px rgba(250,204,21,0.25)',
      }
    : {};

  const scaling = WIDGET_SCALING_CONFIG[widget.type];
  const effectiveWidth = widget.maximized ? windowSize.width : widget.w;
  const effectiveHeight = widget.maximized ? windowSize.height : widget.h;

  const permission = useMemo(
    () => featurePermissions.find((p) => p.widgetType === widget.type),
    [featurePermissions, widget.type]
  );

  // Header height and padding constants
  const HEADER_HEIGHT = UI_CONSTANTS.WIDGET_HEADER_HEIGHT;
  const PADDING = UI_CONSTANTS.WIDGET_PADDING;

  // Calculate a key that changes only when relevant position changes for position-aware widgets.
  // For standard widgets, this key is empty and doesn't trigger updates on drag.
  const positionKey = POSITION_AWARE_WIDGETS.includes(widget.type)
    ? `${widget.x},${widget.y}`
    : '';

  const getWidgetContentInternal = useCallback(
    (w: number, h: number, scale?: number) => {
      return (
        <InnerWidgetRenderer
          widget={widget}
          w={w}
          h={h}
          scale={scale}
          isStudentView={isStudentView}
          studentPin={studentPin}
          isSpotlighted={isSpotlighted}
        />
      );
    },
    // We intentionally decompose the widget dependency here.
    // If we depend on the full `widget` object, this callback will be recreated on every
    // drag frame (since x/y change), forcing ScalableWidget to re-render constantly.
    // InnerWidgetRenderer is already memoized to ignore x/y for most widgets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      widget.id,
      widget.type,
      widget.config,
      widget.flipped,
      widget.minimized,
      widget.maximized,
      widget.customTitle,
      widget.isLive,
      widget.transparency,
      widget.annotation,
      positionKey,
      isStudentView,
      isSpotlighted,
    ]
  );

  const renderScalableContent = useCallback(
    ({
      internalW,
      internalH,
      scale,
    }: {
      internalW: number;
      internalH: number;
      scale: number;
    }) => getWidgetContentInternal(internalW, internalH, scale),
    [getWidgetContentInternal]
  );

  if (widget.type === 'sticker') {
    return <StickerItemWidget widget={widget} />;
  }

  const scalingConfig = scaling ?? DEFAULT_SCALING_CONFIG;

  const finalContent = scalingConfig.skipScaling ? (
    <div
      className="h-full w-full relative"
      style={{
        padding: scalingConfig.padding ?? PADDING,
        containerType: 'size',
      }}
    >
      {getWidgetContentInternal(effectiveWidth, effectiveHeight)}
    </div>
  ) : (
    <ScalableWidget
      width={effectiveWidth}
      height={effectiveHeight}
      baseWidth={scalingConfig.baseWidth ?? 400}
      baseHeight={scalingConfig.baseHeight ?? 400}
      canSpread={scalingConfig.canSpread ?? true}
      headerHeight={HEADER_HEIGHT}
      padding={scalingConfig.padding ?? PADDING}
    >
      {renderScalableContent}
    </ScalableWidget>
  );

  if (isStudentView) {
    const isDrawing = widget.type === 'drawing';
    return (
      <div
        className={`h-full w-full rounded-xl overflow-hidden relative ${
          isDrawing ? 'bg-transparent' : 'bg-white shadow-sm'
        }`}
      >
        {finalContent}
      </div>
    );
  }

  return (
    <DraggableWindow
      widget={widget}
      title={getTitle(widget, permission)}
      settings={getWidgetSettings()}
      appearanceSettings={getWidgetAppearanceSettings()}
      style={customStyle}
      isSpotlighted={isSpotlighted}
      skipCloseConfirmation={
        widget.type === 'classes' || accountDisableCloseConfirmation
      }
      globalStyle={globalStyle}
      headerActions={
        (isLive || canAccessFeature('live-session')) && (
          <LiveControl
            isLive={isLive}
            studentCount={students.length}
            students={students}
            code={sessionCode}
            joinUrl={getJoinUrl()}
            onToggleLive={handleToggleLive}
            onFreezeStudent={(id, status) => {
              void toggleFreezeStudent(id, status).catch((err) =>
                console.error('Failed to freeze student:', err)
              );
            }}
            onRemoveStudent={(id) => {
              void removeStudent(id).catch((err) =>
                console.error('Failed to remove student:', err)
              );
            }}
            onFreezeAll={() => {
              void toggleGlobalFreeze(!isGlobalFrozen).catch((err) =>
                console.error('Failed to toggle global freeze:', err)
              );
            }}
          />
        )
      }
    >
      {finalContent}
    </DraggableWindow>
  );
};

// Internal optimized wrapper to prevent re-renders when x/y coordinates change during drag
interface InnerWidgetRendererProps {
  widget: WidgetData;
  w: number;
  h: number;
  scale?: number;
  isStudentView: boolean;
  studentPin?: string | null;
  isSpotlighted: boolean;
}

const InnerWidgetRenderer = memo(
  function InnerWidgetRenderer({
    widget,
    w,
    h,
    scale,
    isStudentView,
    studentPin,
    isSpotlighted,
  }: InnerWidgetRendererProps) {
    return (
      <WidgetLayoutWrapper
        widget={widget}
        w={w}
        h={h}
        scale={scale}
        isStudentView={isStudentView}
        studentPin={studentPin}
        isSpotlighted={isSpotlighted}
      />
    );
  },
  (prev, next) => {
    // Return true if props are equal (do NOT re-render)
    if (prev.w !== next.w) return false;
    if (prev.h !== next.h) return false;
    if (prev.scale !== next.scale) return false;
    if (prev.isStudentView !== next.isStudentView) return false;
    if (prev.studentPin !== next.studentPin) return false;
    if (prev.isSpotlighted !== next.isSpotlighted) return false;

    // Check widget props - explicitly ignoring x, y, z
    const pw = prev.widget;
    const nw = next.widget;

    if (pw.id !== nw.id) return false;
    if (pw.type !== nw.type) return false; // Defensive check for type change

    // If the widget type is position-aware, we MUST re-render if x or y changed.
    const isPositionAware = [
      'catalyst',
      'catalyst-instruction',
      'catalyst-visual',
    ].includes(nw.type);

    if (isPositionAware) {
      if (pw.x !== nw.x) return false;
      if (pw.y !== nw.y) return false;
    }

    // Other fields
    if (pw.flipped !== nw.flipped) return false;
    if (pw.minimized !== nw.minimized) return false;
    if (pw.maximized !== nw.maximized) return false;
    if (pw.customTitle !== nw.customTitle) return false;
    if (pw.isLive !== nw.isLive) return false;
    if (pw.transparency !== nw.transparency) return false;
    if (pw.annotation !== nw.annotation) return false;
    if (pw.config !== nw.config) return false;

    return true;
  }
);

export const WidgetRenderer = memo(WidgetRendererComponent);
