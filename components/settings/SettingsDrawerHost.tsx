import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { useToolLabel } from '@/hooks/useToolLabel';
import {
  useDashboardActions,
  useDashboardCanvasSelector,
  useDashboardCanvasStateGetter,
  useGlobalStyle,
} from '@/context/dashboardCanvasStore';
import { WIDGET_SETTINGS_SCHEMAS } from '@/components/widgets/WidgetRegistry';
import { getTitle } from '@/utils/widgetHelpers';
import { normalizeFlipped } from '@/utils/migration';
import type { WidgetData, WidgetType } from '@/types';
import { SettingsDrawer } from './SettingsDrawer';
import { LegacySettingsSlot } from './legacy/LegacySettingsSlot';
import type { WidgetSettingsSchema } from './schema/types';
import { useSettingsDrawerPlacement } from './useSettingsDrawerPlacement';
import { useSettingsDrawerCamera } from './useSettingsDrawerCamera';
import {
  useSettingsDrawerFocus,
  useSettingsTargetMarker,
} from './useSettingsDrawerFocus';
import { consumeLocalSettingsOpen } from './settingsOpenSignal';
import {
  markSettingsJustClosed,
  wasSettingsClosedByGesture,
} from './settingsCloseSignal';
import { DRAWER_DEFAULT_WIDTH, SHEET_DEFAULT_VH } from './drawerConstants';

type HostState = {
  activeWidgetId: string | null;
  boardId: string | null;
  readOnly: boolean;
  /** Widget whose stored `flipped: true` must not (re)open the drawer. */
  suppressedId: string | null;
  /** Widget whose `flipped` is cleared in the swap batch. */
  pendingUnflipId: string | null;
  /** Maximized widget that must be restored before its drawer opens (D22). */
  pendingRestoreId: string | null;
  /** Widget whose stored `flipped` must be cleared after read-only ends. */
  pendingUnsuppressId: string | null;
};

type HostAction =
  | {
      type: 'board';
      boardId: string | null;
      activeWidgetId: string | null;
      readOnly: boolean;
    }
  | { type: 'readOnly'; readOnly: boolean }
  | { type: 'close'; suppressId?: string | null }
  | { type: 'unsuppress' }
  | { type: 'open'; id: string; previousId: string | null }
  | { type: 'restore'; id: string }
  | { type: 'refuse'; id: string }
  | { type: 'clearPending' };

const reducer = (state: HostState, action: HostAction): HostState => {
  switch (action.type) {
    case 'board':
      return {
        ...state,
        boardId: action.boardId,
        activeWidgetId: action.activeWidgetId,
        readOnly: action.readOnly,
        suppressedId: null,
        pendingUnflipId: null,
        pendingRestoreId: null,
        pendingUnsuppressId: null,
      };
    case 'readOnly':
      return action.readOnly
        ? {
            ...state,
            readOnly: true,
            activeWidgetId: null,
            suppressedId: state.activeWidgetId,
          }
        : {
            ...state,
            readOnly: false,
            suppressedId: null,
            pendingUnsuppressId: state.suppressedId,
          };
    case 'close':
      return {
        ...state,
        activeWidgetId: null,
        suppressedId: action.suppressId ?? state.suppressedId,
        pendingUnflipId: null,
      };
    case 'unsuppress':
      return { ...state, suppressedId: null };
    case 'open':
      return {
        ...state,
        activeWidgetId: action.id,
        // The swapped-out widget stays suppressed until its flip actually clears.
        suppressedId: action.previousId,
        pendingUnflipId: action.previousId,
        pendingRestoreId: null,
      };
    case 'restore':
      return { ...state, pendingRestoreId: action.id };
    case 'refuse':
      return { ...state, suppressedId: action.id, pendingRestoreId: null };
    case 'clearPending':
      return {
        ...state,
        pendingUnflipId: null,
        pendingRestoreId: null,
        pendingUnsuppressId: null,
      };
    default:
      return state;
  }
};

const flippedWinnerId = (widgets: WidgetData[] | undefined): string | null => {
  if (!widgets) return null;
  const winner = normalizeFlipped(widgets).find((w) => w.flipped);
  return winner?.id ?? null;
};

type SchemaState = {
  type: WidgetType | null;
  schema: WidgetSettingsSchema | null | undefined;
};

const schemaReducer = (_: SchemaState, next: SchemaState): SchemaState => next;

/** Mounted once by DashboardView; owns which widget the settings drawer edits (§3 Selection, §4.8). */
export const SettingsDrawerHost: React.FC = () => {
  const { t } = useTranslation();
  const {
    canAccessFeature,
    canAccessWidget,
    featurePermissions,
    dockPosition,
    settingsDrawerWidth,
    updateUserPreference,
    isAdmin,
  } = useAuth();
  const enabled = canAccessFeature('settings-drawer');
  const toolLabel = useToolLabel();

  const { updateWidget, updateWidgets } = useDashboardActions();
  const getCanvasState = useDashboardCanvasStateGetter();
  const globalStyle = useGlobalStyle();
  const zoom = useDashboardCanvasSelector((s) => s.zoom);
  const boardId = useDashboardCanvasSelector(
    (s) => s.activeDashboard?.id ?? null
  );
  const readOnly = useDashboardCanvasSelector((s) => s.isActiveBoardReadOnly);

  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const initial = getCanvasState();
    return {
      activeWidgetId: flippedWinnerId(initial.activeDashboard?.widgets),
      boardId: initial.activeDashboard?.id ?? null,
      readOnly: initial.isActiveBoardReadOnly,
      suppressedId: null,
      pendingUnflipId: null,
      pendingRestoreId: null,
      pendingUnsuppressId: null,
    };
  });
  const { activeWidgetId, suppressedId } = state;

  // Identity-stable selections: existing widget objects, never allocations (§4.8).
  const widget = useDashboardCanvasSelector((s) =>
    activeWidgetId
      ? (s.activeDashboard?.widgets.find((w) => w.id === activeWidgetId) ??
        null)
      : null
  );
  const otherFlipped = useDashboardCanvasSelector(
    (s) =>
      s.activeDashboard?.widgets.find(
        (w) => w.flipped && w.id !== activeWidgetId && w.id !== suppressedId
      ) ?? null
  );
  const suppressedStillFlipped = useDashboardCanvasSelector((s) =>
    suppressedId
      ? (s.activeDashboard?.widgets.some(
          (w) => w.id === suppressedId && w.flipped
        ) ?? false)
      : false
  );

  // Selection state machine, adjusted while rendering (no effect).
  if (boardId !== state.boardId) {
    dispatch({
      type: 'board',
      boardId,
      activeWidgetId: flippedWinnerId(
        getCanvasState().activeDashboard?.widgets
      ),
      readOnly,
    });
  } else if (readOnly !== state.readOnly) {
    dispatch({ type: 'readOnly', readOnly });
  } else if (suppressedId && !suppressedStillFlipped) {
    dispatch({ type: 'unsuppress' });
  } else if (otherFlipped) {
    if (otherFlipped.maximized) {
      if (state.pendingRestoreId !== otherFlipped.id) {
        dispatch({ type: 'restore', id: otherFlipped.id });
      }
    } else {
      dispatch({
        type: 'open',
        id: otherFlipped.id,
        previousId: activeWidgetId,
      });
    }
  } else if (activeWidgetId && (!widget || widget.flipped !== true)) {
    dispatch({ type: 'close' });
  }

  const open = enabled && !!widget && widget.flipped === true;

  const openerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const originatedRef = useRef(false);
  const openedForRef = useRef<string | null>(null);
  if (open && openedForRef.current !== widget.id) {
    openedForRef.current = widget.id;
    originatedRef.current = consumeLocalSettingsOpen(widget.id);
    openerRef.current =
      typeof document === 'undefined'
        ? null
        : document.querySelector<HTMLElement>(
            `[data-settings-opener="${widget.id}"]`
          );
  } else if (!open && openedForRef.current !== null) {
    openedForRef.current = null;
  }
  const originatedLocally = open && originatedRef.current;

  // Swap and maximize-restore writes: batched, outside render.
  const { pendingUnflipId, pendingRestoreId, pendingUnsuppressId } = state;
  useEffect(() => {
    if (!pendingUnflipId && !pendingRestoreId && !pendingUnsuppressId) return;
    if (pendingUnsuppressId) {
      updateWidget(pendingUnsuppressId, { flipped: false });
    }
    if (pendingUnflipId && activeWidgetId) {
      updateWidgets([
        { id: activeWidgetId, changes: { flipped: true } },
        { id: pendingUnflipId, changes: { flipped: false } },
      ]);
    }
    if (pendingRestoreId) {
      const target = getCanvasState().activeDashboard?.widgets.find(
        (w) => w.id === pendingRestoreId
      );
      if ((target?.isLocked ?? false) || readOnly) {
        // A locked or read-only maximized widget cannot be restored, so refuse (D22).
        if (!readOnly) updateWidget(pendingRestoreId, { flipped: false });
        dispatch({ type: 'refuse', id: pendingRestoreId });
        return;
      }
      const id = pendingRestoreId;
      updateWidget(id, { maximized: false, flipped: false });
      queueMicrotask(() => updateWidget(id, { flipped: true }));
    }
    dispatch({ type: 'clearPending' });
  }, [
    pendingUnflipId,
    pendingRestoreId,
    pendingUnsuppressId,
    activeWidgetId,
    readOnly,
    updateWidget,
    updateWidgets,
    getCanvasState,
  ]);

  const drawerWidth = settingsDrawerWidth || DRAWER_DEFAULT_WIDTH;
  const placement = useSettingsDrawerPlacement({
    widgetId: open ? widget.id : null,
    open,
    drawerWidth,
    dockPosition,
  });
  const isSheet = placement.placement === 'bottom';

  const closedByGestureRef = useRef(false);
  if (!open && !closedByGestureRef.current && wasSettingsClosedByGesture()) {
    closedByGestureRef.current = true;
  } else if (open && closedByGestureRef.current) {
    closedByGestureRef.current = false;
  }

  useSettingsDrawerCamera({
    widgetId: open ? widget.id : null,
    open,
    originatedLocally,
    placement: placement.placement,
    needsPan: placement.needsPan,
    rect: placement.rect,
    drawerWidth,
    zoom,
    boardId,
    restoreOnClose: !closedByGestureRef.current,
  });

  useSettingsTargetMarker(open ? widget.id : null, open);

  useSettingsDrawerFocus({
    widgetId: open ? widget.id : null,
    open: originatedLocally,
    headingRef,
    openerRef,
  });

  // Schema loading: dispatch (not setState) keeps the no-setState-in-effect rule.
  const widgetType = open ? widget.type : null;
  const [schemaState, dispatchSchema] = useReducer(schemaReducer, {
    type: null,
    schema: null,
  });
  useEffect(() => {
    if (!widgetType) return undefined;
    const loader = WIDGET_SETTINGS_SCHEMAS[widgetType];
    if (!loader) {
      dispatchSchema({ type: widgetType, schema: null });
      return undefined;
    }
    dispatchSchema({ type: widgetType, schema: undefined });
    let cancelled = false;
    void loader()
      .then((loaded) => {
        if (!cancelled) dispatchSchema({ type: widgetType, schema: loaded });
      })
      .catch(() => {
        // A rejected chunk load falls back to legacy content, not a stuck skeleton.
        if (!cancelled) dispatchSchema({ type: widgetType, schema: null });
      });
    return () => {
      cancelled = true;
    };
  }, [widgetType]);
  const schema =
    widgetType && schemaState.type === widgetType ? schemaState.schema : null;

  const permission = useMemo(
    () =>
      widget
        ? featurePermissions.find((p) => p.widgetType === widget.type)
        : undefined,
    [featurePermissions, widget]
  );

  const widgetId = widget?.id;
  const widgetConfig = widget?.config;
  const legacySettingsContent = useMemo(
    () => (widget ? <LegacySettingsSlot widget={widget} /> : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memoized on id + config only (§4.8)
    [widgetId, widgetConfig]
  );
  const legacyStyleContent = useMemo(
    () =>
      widget ? <LegacySettingsSlot widget={widget} slot="appearance" /> : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memoized on id + config only (§4.8)
    [widgetId, widgetConfig]
  );

  const handleClose = useCallback(() => {
    if (!widgetId) return;
    markSettingsJustClosed();
    if (readOnly) {
      dispatch({ type: 'close', suppressId: widgetId });
      return;
    }
    updateWidget(widgetId, { flipped: false });
  }, [widgetId, readOnly, updateWidget]);

  // Sparse patch: updateWidget merges over the live config, so an async write never reverts newer keys.
  const updateConfig = useCallback(
    (patch: Record<string, unknown>) => {
      if (!widgetId || readOnly) return;
      updateWidget(widgetId, { config: patch });
    },
    [widgetId, readOnly, updateWidget]
  );

  const handleWidthCommit = useCallback(
    (size: number) => {
      if (isSheet) return;
      void updateUserPreference('settingsDrawerWidth', size);
    },
    [isSheet, updateUserPreference]
  );

  if (!open) return null;

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {originatedLocally && placement.announcementKey
          ? t(placement.announcementKey)
          : ''}
      </div>
      <SettingsDrawer
        widget={widget}
        title={getTitle(widget, permission)}
        placement={placement.placement}
        width={isSheet ? SHEET_DEFAULT_VH : drawerWidth}
        onWidthCommit={handleWidthCommit}
        onClose={handleClose}
        updateWidget={updateWidget}
        updateConfig={updateConfig}
        globalStyle={globalStyle}
        schema={schema}
        legacySettingsContent={legacySettingsContent}
        legacyStyleContent={legacyStyleContent}
        readOnly={readOnly}
        isAdmin={isAdmin === true}
        canAccessFeature={canAccessFeature}
        canAccessWidget={canAccessWidget}
        toolLabel={toolLabel}
        headingRef={headingRef}
      />
    </>
  );
};
