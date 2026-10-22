// A library widget on a Synced or View-Only board that is open on a colleague's item (co-teaching plan D5).

import React, { useMemo, useState } from 'react';
import { ArrowLeft, Copy, Loader2 } from 'lucide-react';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useDashboard } from '@/context/useDashboard';
import { useSharedBoardItem } from '@/hooks/useSharedBoardItem';
import { logError } from '@/utils/logError';
import { tourAttr } from '@/config/tourAnchors';
import type {
  SharedBoardItemDoc,
  SharedBoardItemKind,
} from '@/utils/sharedBoardItems';
import type { WidgetData } from '@/types';

/** Widget config without the whole config union, which is too wide to spread. */
type WidgetConfigRecord = Record<string, unknown>;

const PAD = 'min(8px, 2cqmin) min(12px, 3cqmin)';
const NOTE = 'min(12px, 3.5cqmin)';
const ICON = 'min(14px, 4cqmin)';

interface SharedBoardItemPanelProps {
  /** What the item is, in the button's words: "quiz", "video activity". */
  label: string;
  /** Why Assign is off, shown in its place. */
  disabledReason?: string;
  /** Saves the linked copy and returns its id in the viewer's library. */
  onCopy: () => Promise<string>;
  onCopied: (copyId: string) => void;
  children: React.ReactNode;
}

/** The colleague's item, read-only, with Assign making a copy in the viewer's own library. */
export const SharedBoardItemPanel: React.FC<SharedBoardItemPanelProps> = ({
  label,
  disabledReason,
  onCopy,
  onCopied,
  children,
}) => {
  const { addToast } = useDashboard();
  const [copying, setCopying] = useState(false);

  const assign = async () => {
    setCopying(true);
    try {
      onCopied(await onCopy());
    } catch (err) {
      logError('SharedBoardItemPanel.copy', err, { label });
      addToast(
        err instanceof Error && err.message
          ? err.message
          : `Could not copy the ${label} to your library.`,
        'error'
      );
      setCopying(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">{children}</div>
      <div
        className="flex items-center justify-between border-t border-slate-200"
        style={{ gap: 'min(8px, 2cqmin)', padding: PAD }}
      >
        <span className="min-w-0 text-slate-600" style={{ fontSize: NOTE }}>
          {disabledReason ?? 'View only. Assign saves a copy to your library.'}
        </span>
        {!disabledReason && (
          <button
            type="button"
            onClick={() => void assign()}
            disabled={copying}
            {...tourAttr('colleague-item.assign')}
            className="flex shrink-0 items-center rounded-lg bg-brand-blue-primary font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-60"
            style={{ gap: 'min(6px, 1.5cqmin)', padding: PAD, fontSize: NOTE }}
          >
            {copying ? (
              <Loader2
                className="animate-spin"
                style={{ width: ICON, height: ICON }}
                aria-hidden="true"
              />
            ) : (
              <Copy style={{ width: ICON, height: ICON }} aria-hidden="true" />
            )}
            Assign
          </button>
        )}
      </div>
    </div>
  );
};

interface LocalWidgetScopeProps {
  widget: WidgetData;
  onBack: () => void;
  /** What the board shows, for the way back: "quiz", "video activity". */
  label: string;
  children: (widget: WidgetData) => React.ReactNode;
}

/** The viewer's own library in this widget, kept off the shared board so the colleague's widget doesn't follow. */
const LocalWidgetScope: React.FC<LocalWidgetScopeProps> = ({
  widget,
  onBack,
  label,
  children,
}) => {
  const dashboard = useDashboard();
  const [config, setConfig] = useState<WidgetConfigRecord>(
    widget.config as WidgetConfigRecord
  );
  const widgetId = widget.id;
  const realUpdate = dashboard.updateWidget;
  const value = useMemo(
    () => ({
      ...dashboard,
      updateWidget: (
        id: string,
        updates: Partial<WidgetData>,
        opts?: { immediate?: boolean; skipHistory?: boolean }
      ) => {
        if (id !== widgetId) {
          realUpdate(id, updates, opts);
          return;
        }
        const { config: nextConfig, ...rest } = updates;
        if (nextConfig) {
          const patch = nextConfig as WidgetConfigRecord;
          setConfig((prev) => ({ ...prev, ...patch }));
        }
        if (Object.keys(rest).length > 0) realUpdate(id, rest, opts);
      },
    }),
    [dashboard, realUpdate, widgetId]
  );
  const localWidget = useMemo(
    (): WidgetData => ({ ...widget, config }),
    [widget, config]
  );

  return (
    <DashboardContext.Provider value={value}>
      <div className="flex h-full min-h-0 flex-col">
        <button
          type="button"
          onClick={onBack}
          {...tourAttr('colleague-item.back')}
          className="flex shrink-0 items-center border-b border-slate-200 font-medium text-slate-600 hover:text-slate-900"
          style={{ gap: 'min(6px, 1.5cqmin)', padding: PAD, fontSize: NOTE }}
        >
          <ArrowLeft style={{ width: ICON, height: ICON }} aria-hidden="true" />
          {`Back to the shared ${label}`}
        </button>
        <div className="min-h-0 flex-1">{children(localWidget)}</div>
      </div>
    </DashboardContext.Provider>
  );
};

interface SharedBoardItemGateProps<T> {
  widget: WidgetData;
  kind: SharedBoardItemKind;
  /** The item the widget shows, or null when it shows the library. */
  itemId: string | null | undefined;
  label: string;
  /** Config for the viewer's own library view after Assign. */
  libraryConfig: WidgetConfigRecord;
  renderShared: (
    item: SharedBoardItemDoc<T>,
    onCopied: (copyId: string) => void
  ) => React.ReactNode;
  renderOwn: (widget: WidgetData, assignOnOpen?: string) => React.ReactNode;
}

/**
 * Renders the teacher widget unless another board member's item is open in it.
 * Assign switches this viewer, and only this viewer, to their own library with
 * the copy's assign step open.
 */
export function SharedBoardItemGate<T>({
  widget,
  kind,
  itemId,
  label,
  libraryConfig,
  renderShared,
  renderOwn,
}: SharedBoardItemGateProps<T>): React.ReactElement {
  const shared = useSharedBoardItem<T>(kind, itemId);
  const [own, setOwn] = useState<{
    itemId: string;
    copyId: string;
  } | null>(null);

  if (shared.status !== 'foreign' || !shared.item || !itemId) {
    return <>{renderOwn(widget)}</>;
  }
  if (own && own.itemId === itemId) {
    return (
      <LocalWidgetScope
        key={`${itemId}:${own.copyId}`}
        widget={{
          ...widget,
          config: {
            ...(widget.config as WidgetConfigRecord),
            ...libraryConfig,
          },
        }}
        label={label}
        onBack={() => setOwn(null)}
      >
        {(local) => renderOwn(local, own.copyId)}
      </LocalWidgetScope>
    );
  }
  return (
    <>{renderShared(shared.item, (copyId) => setOwn({ itemId, copyId }))}</>
  );
}
