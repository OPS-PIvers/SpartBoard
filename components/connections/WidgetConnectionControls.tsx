import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Play, Plus, Square, Workflow } from 'lucide-react';
import type { WidgetConnection, WidgetData } from '@/types';
import { IconButton } from '@/components/common/IconButton';
import { useConnectionsEnabled } from '@/hooks/useConnectionsEnabled';
import {
  useDashboardCanvasSelector,
  useDashboardCanvasStateGetter,
} from '@/context/dashboardCanvasStore';
import {
  connectionsUi,
  pickInConnectMode,
  startConnectMode,
  useConnectionsUi,
} from '@/context/connectionsUiStore';
import { isConnectable } from '@/config/widgetConnections';
import { liveConnections, liveSteps } from '@/utils/connectionEngine';
import { getTitle } from '@/utils/widgetHelpers';
import { sendRunCommand } from '@/utils/connectionSignals';
import { tourAttr } from '@/config/tourAnchors';
import { Z_INDEX } from '@/config/zIndex';

/** Step numbers this widget holds across its board's live Sequences, plus whether the current Run step is its own. */
const summaryKey = (
  connections: WidgetConnection[] | undefined,
  widgets: WidgetData[],
  widgetId: string
): string => {
  const numbers: number[] = [];
  let running = false;
  let follows = false;
  let firstId = '';
  let seqId = '';
  let seqRunning = false;
  for (const c of liveConnections(connections, widgets)) {
    if (c.kind === 'follow') {
      if (c.leaderId === widgetId || c.followerId === widgetId) {
        follows = true;
        firstId ||= c.id;
      }
      continue;
    }
    liveSteps(c, widgets).forEach((s, i) => {
      if (!s.actions.some((a) => a.widgetId === widgetId)) return;
      numbers.push(i + 1);
      firstId ||= c.id;
      if (!seqId) {
        seqId = c.id;
        seqRunning = !!c.run;
      }
      if (c.run?.stepIndex === i) running = true;
    });
  }
  if (!firstId) return '';
  return [
    firstId,
    numbers.join(' · '),
    running ? '1' : '',
    follows ? '1' : '',
    seqId,
    seqRunning ? '1' : '',
  ].join('|');
};

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

const openEditor = (boardId: string, connection: WidgetConnection) =>
  connectionsUi.set({
    editor: {
      boardId,
      connections: [connection],
      replaces: [connection.id],
    },
    connectMode: null,
  });

/** Corner badge on a connected widget: its step numbers; opens Start/Stop and Edit steps. */
export const ConnectionBadge: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const enabled = useConnectionsEnabled();
  const summary = useWidgetConnectionSummary(widget.id);
  const boardId = useDashboardCanvasSelector((s) => s.activeDashboard?.id);
  const inConnectMode = useConnectionsUi((s) => !!s.connectMode);
  const getCanvasState = useDashboardCanvasStateGetter();
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  if (!enabled || !summary || !boardId || inConnectMode) return null;
  const close = () => setMenuAt(null);
  const edit = () => {
    close();
    const connection = findConnection(
      getCanvasState,
      summary.seqId || summary.connectionId
    );
    if (connection) openEditor(boardId, connection);
  };
  const label = t('connections.badgeTitle', {
    name: getTitle(widget),
    defaultValue: 'Connected: open the steps',
  });
  const itemClass =
    'w-full text-left px-3 py-2 hover:bg-slate-100 flex items-center gap-2';
  return (
    <>
      <button
        type="button"
        {...tourAttr('widget.connection-badge', widget.id, widget.type)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
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
        className={`touch-target-expand absolute -top-3 left-7 flex items-center gap-1 rounded-full px-2 py-0.5 text-xxs font-bold shadow-md [-webkit-tap-highlight-color:transparent] ${
          summary.running
            ? 'bg-brand-red-primary text-white ring-2 ring-white motion-safe:animate-pulse'
            : 'bg-brand-blue-primary text-white'
        }`}
        // Clear of the corner resize zone and above the edge resize strips.
        style={{ zIndex: Z_INDEX.widgetResize + 1 }}
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
                left: menuAt.left,
                top: menuAt.bottom + 6,
                zIndex: Z_INDEX.toolMenu + 1,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
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
                    sendRunCommand(summary.seqId, 'stop');
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
                    sendRunCommand(summary.seqId, 'start');
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

const findConnection = (
  getState: ReturnType<typeof useDashboardCanvasStateGetter>,
  id: string
) => getState().activeDashboard?.connections?.find((c) => c.id === id);

/** Dims, numbers and highlights widgets while Connect mode is picking; it takes the tap so the widget underneath doesn't act. */
export const ConnectPickOverlay: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
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
        name: getTitle(widget),
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
export const ConnectToolbarButton: React.FC<{
  widget: WidgetData;
  onAction: () => void;
}> = ({ widget, onAction }) => {
  const { t } = useTranslation();
  const enabled = useConnectionsEnabled();
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
  if (!enabled || !boardId || !isConnectable(widget.type)) return null;
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
                    if (c) openEditor(boardId, c);
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
export const ConnectionCloseWarning: React.FC<{ widgetId: string }> = ({
  widgetId,
}) => {
  const { t } = useTranslation();
  const enabled = useConnectionsEnabled();
  const summary = useWidgetConnectionSummary(widgetId);
  if (!enabled || !summary) return null;
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
