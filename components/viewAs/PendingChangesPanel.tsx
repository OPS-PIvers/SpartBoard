// View as pending board changes: grouped by board and widget, approve or discard each (docs/plans/ADMIN_VIEW_AS.md D11).
import React, { useState } from 'react';
import { Check, Loader2, Undo2, X } from 'lucide-react';
import { TOOLS } from '@/config/tools';
import { Z_INDEX } from '@/config/zIndex';
import { pendingRows, words } from '@/utils/viewAsPendingFormat';
import {
  discardViewAsChange,
  markViewAsChangeApproved,
  type PendingChange,
} from '@/utils/viewAsBoards';
import { approveViewAsChange } from '@/utils/viewAsApprove';

const widgetName = (change: PendingChange): string =>
  change.widget.customTitle ??
  TOOLS.find((t) => t.type === change.widget.type)?.label ??
  words(change.widget.type);

interface Group {
  boardId: string;
  boardName: string;
  widgets: { widgetId: string; name: string; changes: PendingChange[] }[];
}

const groupChanges = (changes: PendingChange[]): Group[] => {
  const boards = new Map<string, Group>();
  for (const change of changes) {
    let board = boards.get(change.boardId);
    if (!board) {
      board = {
        boardId: change.boardId,
        boardName: change.boardName,
        widgets: [],
      };
      boards.set(change.boardId, board);
    }
    let widget = board.widgets.find((w) => w.widgetId === change.widgetId);
    if (!widget) {
      widget = {
        widgetId: change.widgetId,
        name: widgetName(change),
        changes: [],
      };
      board.widgets.push(widget);
    }
    widget.changes.push(change);
  }
  return Array.from(boards.values());
};

interface PendingChangesPanelProps {
  changes: PendingChange[];
  readOnly: boolean;
  top: number;
  onClose: () => void;
}

export const PendingChangesPanel: React.FC<PendingChangesPanelProps> = ({
  changes,
  readOnly,
  top,
  onClose,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [staleKeys, setStaleKeys] = useState<Set<string>>(() => new Set());

  const isStale = (c: PendingChange) => c.stale || staleKeys.has(c.key);
  const approvable = changes.filter((c) => !isStale(c));

  const approveOne = async (change: PendingChange): Promise<void> => {
    try {
      const result = await approveViewAsChange(change);
      if (result === 'stale') {
        setStaleKeys((prev) => new Set(prev).add(change.key));
        return;
      }
      markViewAsChangeApproved(change);
      setErrors(({ [change.key]: _drop, ...rest }) => rest);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [change.key]: err instanceof Error ? err.message : 'Approve failed',
      }));
    }
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const approveAll = () =>
    run('all', async () => {
      for (const change of approvable) await approveOne(change);
    });

  return (
    <div
      role="dialog"
      aria-label="Pending changes"
      data-testid="view-as-pending-panel"
      className="fixed right-3 w-[380px] max-w-[calc(100vw-24px)] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl text-slate-900"
      style={{
        top,
        maxHeight: `calc(100dvh - ${top + 12}px)`,
        zIndex: Z_INDEX.viewAsBanner,
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
        <h2 className="text-sm font-bold flex-1">
          Pending changes ({changes.length})
        </h2>
        <button
          type="button"
          disabled={readOnly || busy !== null || approvable.length === 0}
          onClick={() => void approveAll()}
          title={readOnly ? 'Unlock edits to do this' : undefined}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === 'all' ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
          Approve all
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
        >
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto px-4 pt-3 pb-4 flex flex-col gap-4">
        {changes.length === 0 && (
          <p className="text-sm text-slate-500">No pending changes</p>
        )}
        {groupChanges(changes).map((board) => (
          <section key={board.boardId} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {board.boardName}
            </h3>
            {board.widgets.map((widget) => (
              <div
                key={widget.widgetId}
                className="rounded-lg border border-slate-200"
              >
                <div className="px-3 py-2 text-sm font-semibold border-b border-slate-100">
                  {widget.name}
                </div>
                {widget.changes.map((change) => {
                  const stale = isStale(change);
                  return (
                    <div
                      key={change.key}
                      data-testid="view-as-pending-item"
                      className="px-3 py-2 flex flex-col gap-1.5 border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600 flex-1">
                          {change.kind === 'layout' ? 'Layout' : 'Settings'}
                        </span>
                        {stale && (
                          <span className="text-xs font-semibold text-amber-700">
                            Removed from their board
                          </span>
                        )}
                      </div>
                      <table className="w-full table-fixed text-xs">
                        <tbody>
                          {pendingRows(change).map((row) => (
                            <tr key={row.field}>
                              <td className="w-[40%] py-0.5 pr-2 text-slate-500 align-top truncate">
                                {row.label}
                              </td>
                              <td className="w-[30%] py-0.5 pr-2 text-slate-500 line-through align-top truncate">
                                {row.before}
                              </td>
                              <td className="w-[30%] py-0.5 font-semibold align-top truncate">
                                {row.after}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {errors[change.key] && (
                        <p role="alert" className="text-xs text-red-600">
                          {errors[change.key]}
                        </p>
                      )}
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => discardViewAsChange(change)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          <Undo2 size={12} />
                          Discard
                        </button>
                        <button
                          type="button"
                          disabled={readOnly || stale || busy !== null}
                          title={
                            readOnly ? 'Unlock edits to do this' : undefined
                          }
                          onClick={() =>
                            void run(change.key, () => approveOne(change))
                          }
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busy === change.key ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Approve
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
};
