import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Pencil,
  Play,
  Plus,
  Square,
  Workflow,
  SkipForward,
} from 'lucide-react';
import type { WidgetData } from '@/types';
import { IconButton } from '@/components/common/IconButton';
import { useConnectionsEnabled } from '@/hooks/useConnectionsEnabled';
import {
  useDashboardCanvasSelector,
  useDashboardCanvasStateGetter,
} from '@/context/dashboardCanvasStore';
import {
  connectionsUi,
  openConnectionEditor as openEditor,
  pickInConnectMode,
  startConnectMode,
  useConnectionsUi,
} from '@/context/connectionsUiStore';
import { isConnectable } from '@/config/widgetConnections';
import { liveConnections } from '@/utils/connectionEngine';
import { summaryKey } from './connectionSummary';
import { useConnectionWidgetTitle } from '@/hooks/useConnectionWidgetTitle';
import { sendRunCommand } from '@/utils/connectionSignals';
import { tourAttr } from '@/config/tourAnchors';
import { Z_INDEX } from '@/config/zIndex';

const useWidgetConnectionSummary = (widgetId: string) => {
  const key = useDashboardCanvasSelector((s) =>
    summaryKey(
      s.activeDashboard?.connections,
      s.activeDashboard?.widgets ?? [],
      widgetId
    )
  );
  if (!key) return null;
  const [connectionId, numbers, running, follows, seqId, seqRunning] =
    key.split('|');
  return {
    connectionId,
    numbers,
    running: running === '1',
    follows: follows === '1',
    seqId,
    seqRunning: seqRunning === '1',
  };
};

/** Corner tab on a connected widget: its step numbers; opens Start/Stop and Edit steps, and a drag on it resizes. */
const ConnectionBadgeInner: React.FC<{
  widget: WidgetData;
  onResizeStart?: (e: React.PointerEvent) => void;
}> = ({ widget, onResizeStart }) => {
  const { t } = useTranslation();
  const titleOf = useConnectionWidgetTitle();
  const summary = useWidgetConnectionSummary(widget.id);
  const boardId = useDashboardCanvasSelector((s) => s.activeDashboard?.id);
  const inConnectMode = useConnectionsUi((s) => !!s.connectMode);
  const getCanvasState = useDashboardCanvasStateGetter();
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  if (!summary || !boardId || inConnectMode) return null;
  const close = () => setMenuAt(null);
  const edit = () => {
    close();
    const connection = findConnection(
      getCanvasState,
      summary.seqId || summary.connectionId
    );
    if (connection) {
      openEditor(
        boardId,
        connection,
        getCanvasState().activeDashboard?.connections ?? []
      );
    }
  };
  const label = t('connections.badgeTitle', {
    name: titleOf(widget),
    defaultValue: 'Connected: open the steps',
  });
  const itemClass =
    'w-full min-h-11 text-left px-3 py-2 hover:bg-slate-100 flex items-center gap-2';
  return (
    <>
      <button
        type="button"
        {...tourAttr('widget.connection-badge', widget.id, widget.type)}
        onPointerDown={(e) => {
          e.stopPropagation();
          downAt.current = { x: e.clientX, y: e.clientY };
          onResizeStart?.(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          const d = downAt.current;
          downAt.current = null;
          if (
            e.detail > 0 &&
            d &&
            Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4
          )
            return;
          if (!summary.seqId) {
            edit();
            return;
          }
          setMenuAt(menuAt ? null : e.currentTarget.getBoundingClientRect());
        }}
        onPointerEnter={() =>
          connectionsUi.set({ highlightedId: summary.connectionId })
        }
        onPointerLeave={() => connectionsUi.set({ highlightedId: null })}
        title={label}
        aria-label={label}
        aria-haspopup={summary.seqId ? 'menu' : undefined}
        aria-expanded={summary.seqId ? !!menuAt : undefined}
        className={`absolute top-0 right-0 flex items-center gap-1 rounded-bl-xl px-2.5 py-1.5 text-xxs font-bold leading-none text-white [-webkit-tap-highlight-color:transparent] ${
          summary.running
            ? 'bg-brand-red-primary motion-safe:animate-pulse'
            : 'bg-brand-blue-primary'
        }`}
        // Follows the widget's corner radius; sits above the corner resize zone and takes over its drag.
        style={{
          borderTopRightRadius: 'inherit',
          zIndex: Z_INDEX.widgetResize + 1,
        }}
      >
        <Workflow className="w-3 h-3" aria-hidden="true" />
        {summary.numbers && <span>{summary.numbers}</span>}
      </button>
      {menuAt &&
        createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: Z_INDEX.toolMenu }}
              onPointerDown={(e) => {
                e.stopPropagation();
                close();
              }}
            />
            <div
              role="menu"
              className="fixed min-w-48 rounded-xl bg-white shadow-xl border border-slate-200 py-1 text-sm text-slate-700"
              style={{
                right: Math.min(
                  Math.max(8, window.innerWidth - menuAt.right),
                  window.innerWidth - MENU_MIN_WIDTH - 8
                ),
                top: menuAt.bottom + 6,
                zIndex: Z_INDEX.toolMenu + 1,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {summary.seqRunning && (
                <button
                  type="button"
                  role="menuitem"
                  {...tourAttr(
                    'widget.connection-next',
                    widget.id,
                    widget.type
                  )}
                  className={itemClass}
                  onClick={() => {
                    close();
                    sendRunCommand(boardId, summary.seqId, 'next');
                  }}
                >
                  <SkipForward className="w-4 h-4" aria-hidden="true" />
                  {t('connections.next', { defaultValue: 'Next' })}
                </button>
              )}
              {summary.seqRunning ? (
                <button
                  type="button"
                  role="menuitem"
                  {...tourAttr(
                    'widget.connection-stop',
                    widget.id,
                    widget.type
                  )}
                  className={itemClass}
                  onClick={() => {
                    close();
                    sendRunCommand(boardId, summary.seqId, 'stop');
                  }}
                >
                  <Square className="w-4 h-4" aria-hidden="true" />
                  {t('connections.stop', { defaultValue: 'Stop' })}
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  {...tourAttr(
                    'widget.connection-start',
                    widget.id,
                    widget.type
                  )}
                  className={itemClass}
                  onClick={() => {
                    close();
                    sendRunCommand(boardId, summary.seqId, 'start');
                  }}
                >
                  <Play className="w-4 h-4" aria-hidden="true" />
                  {t('connections.startFromTop', {
                    defaultValue: 'Start from step 1',
                  })}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                {...tourAttr('widget.connection-edit', widget.id, widget.type)}
                className={`${itemClass} border-t border-slate-100`}
                onClick={edit}
              >
                <Pencil className="w-4 h-4" aria-hidden="true" />
                {t('connections.editSteps', { defaultValue: 'Edit steps' })}
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
};

const MENU_MIN_WIDTH = 192; // min-w-48

const findConnection = (
  getState: ReturnType<typeof useDashboardCanvasStateGetter>,
  id: string
) => getState().activeDashboard?.connections?.find((c) => c.id === id);

/** Outlines the widget whose card is picked in the step editor. */
const ConnectionWidgetHighlightInner: React.FC<{ widgetId: string }> = ({
  widgetId,
}) => {
  const lit = useConnectionsUi((s) => s.highlightedWidgetId === widgetId);
  if (!lit) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -inset-1.5 rounded-[inherit] ring-4 ring-brand-blue-primary"
      style={{ zIndex: 21 }}
    />
  );
};

/** Dims, numbers and highlights widgets while Connect mode is picking; it takes the tap so the widget underneath doesn't act. */
const ConnectPickOverlayInner: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const titleOf = useConnectionWidgetTitle();
  const picksKey = useConnectionsUi((s) =>
    s.connectMode
      ? s.connectMode.picks
          .map((id, i) => (id === widget.id ? i + 1 : 0))
          .filter(Boolean)
          .join(' · ') || '-'
      : ''
  );
  if (!picksKey) return null;
  const eligible = isConnectable(widget.type);
  const picked = picksKey !== '-';
  return (
    <button
      type="button"
      disabled={!eligible}
      {...tourAttr('widget.connect-pick', widget.id, widget.type)}
      aria-label={t('connections.pick', {
        name: titleOf(widget),
        defaultValue: 'Add {{name}}',
      })}
      aria-pressed={picked}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (eligible) pickInConnectMode(widget.id);
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        borderRadius: 'inherit',
      }}
      className={`flex items-center justify-center [-webkit-tap-highlight-color:transparent] ${
        !eligible
          ? 'bg-slate-900/55 cursor-not-allowed'
          : picked
            ? 'ring-4 ring-brand-blue-primary bg-brand-blue-primary/15 cursor-pointer'
            : 'ring-2 ring-brand-blue-light/70 bg-white/5 cursor-pointer'
      }`}
    >
      {picked && (
        <span className="rounded-full bg-brand-blue-primary text-white font-black shadow-lg px-3 py-1 text-lg">
          {picksKey}
        </span>
      )}
    </button>
  );
};

/** Connect button on the widget toolbar; lists this widget's Connections when it already has some. */
const ConnectToolbarButtonInner: React.FC<{
  widget: WidgetData;
  onAction: () => void;
}> = ({ widget, onAction }) => {
  const { t } = useTranslation();
  const boardId = useDashboardCanvasSelector((s) => s.activeDashboard?.id);
  const mine = useDashboardCanvasSelector((s) =>
    liveConnections(
      s.activeDashboard?.connections,
      s.activeDashboard?.widgets ?? []
    )
      .filter((c) =>
        c.kind === 'follow'
          ? c.leaderId === widget.id || c.followerId === widget.id
          : c.steps.some((st) =>
              st.actions.some((a) => a.widgetId === widget.id)
            )
      )
      .map((c) => c.id)
      .join(',')
  );
  const getCanvasState = useDashboardCanvasStateGetter();
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  if (!boardId || !isConnectable(widget.type)) return null;
  const ids = mine ? mine.split(',') : [];

  const startNew = () => {
    setMenuAt(null);
    startConnectMode(boardId, widget.id);
    onAction();
  };

  const rect = menuAt;
  return (
    <div className="relative flex items-center">
      <IconButton
        {...tourAttr('widget.connect', widget.id, widget.type)}
        onClick={(e) => {
          e.stopPropagation();
          if (ids.length === 0) startNew();
          else
            setMenuAt(menuAt ? null : e.currentTarget.getBoundingClientRect());
        }}
        icon={<Workflow className="w-3.5 h-3.5" />}
        label={t('connections.connect', { defaultValue: 'Connect' })}
        size="sm"
        variant="glass"
        className={ids.length > 0 ? 'text-blue-600!' : undefined}
      />
      {rect &&
        createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: Z_INDEX.toolMenu }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setMenuAt(null);
              }}
            />
            <div
              role="menu"
              className="fixed min-w-48 rounded-xl bg-white shadow-xl border border-slate-200 py-1 text-sm text-slate-700"
              style={{
                left: rect.left,
                top: rect.bottom + 8,
                zIndex: Z_INDEX.toolMenu + 1,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {ids.map((id, i) => (
                <button
                  key={id}
                  role="menuitem"
                  type="button"
                  {...tourAttr(
                    'widget.connect-menu.connection',
                    widget.id,
                    widget.type
                  )}
                  className="w-full text-left px-3 py-2 hover:bg-slate-100 flex items-center gap-2"
                  onClick={() => {
                    setMenuAt(null);
                    const c = findConnection(getCanvasState, id);
                    if (c) {
                      openEditor(
                        boardId,
                        c,
                        getCanvasState().activeDashboard?.connections ?? []
                      );
                    }
                    onAction();
                  }}
                >
                  <Workflow
                    className="w-4 h-4 text-brand-blue-primary"
                    aria-hidden="true"
                  />
                  {t('connections.menuConnection', {
                    n: i + 1,
                    defaultValue: 'Connection {{n}}',
                  })}
                </button>
              ))}
              <button
                role="menuitem"
                type="button"
                {...tourAttr('widget.connect-menu.new', widget.id, widget.type)}
                className="w-full text-left px-3 py-2 hover:bg-slate-100 flex items-center gap-2 border-t border-slate-100"
                onClick={startNew}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('connections.newConnection', {
                  defaultValue: 'New connection',
                })}
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  );
};

/** Extra line in the close-widget confirm when the widget is part of a Connection. */
const ConnectionCloseWarningInner: React.FC<{ widgetId: string }> = ({
  widgetId,
}) => {
  const { t } = useTranslation();
  const summary = useWidgetConnectionSummary(widgetId);
  if (!summary) return null;
  return (
    <p className="-mt-2 mb-4 text-xs text-slate-200">
      {summary.numbers
        ? t('connections.closeWarningStep', {
            steps: summary.numbers,
            defaultValue:
              'This widget is step {{steps}} of a connection. Closing removes it from the steps.',
          })
        : t('connections.closeWarning', {
            defaultValue: 'Closing removes this widget from its connection.',
          })}
    </p>
  );
};

// With the flag off, widgets mount none of the Connections selectors, so the canvas does no extra work.
export const ConnectionBadge: React.FC<{
  widget: WidgetData;
  onResizeStart?: (e: React.PointerEvent) => void;
}> = (props) =>
  useConnectionsEnabled() ? <ConnectionBadgeInner {...props} /> : null;

export const ConnectionWidgetHighlight: React.FC<{ widgetId: string }> = (
  props
) =>
  useConnectionsEnabled() ? (
    <ConnectionWidgetHighlightInner {...props} />
  ) : null;

export const ConnectPickOverlay: React.FC<{ widget: WidgetData }> = (props) =>
  useConnectionsEnabled() ? <ConnectPickOverlayInner {...props} /> : null;

export const ConnectToolbarButton: React.FC<{
  widget: WidgetData;
  onAction: () => void;
}> = (props) =>
  useConnectionsEnabled() ? <ConnectToolbarButtonInner {...props} /> : null;

export const ConnectionCloseWarning: React.FC<{ widgetId: string }> = (
  props
) =>
  useConnectionsEnabled() ? <ConnectionCloseWarningInner {...props} /> : null;
