import React, { useId, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Inbox,
  Loader2,
  PowerOff,
  Send,
  Trash2,
} from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { useDialog } from '@/context/useDialog';
import { useDashboard } from '@/context/useDashboard';
import { logError } from '@/utils/logError';
import {
  compareAssigned,
  type AssignedClass,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import {
  leftOpenKey,
  readLeftOpenDismissals,
  writeLeftOpenDismissals,
} from './leftOpenDismissals';
import { AssignedBulkBar } from './AssignedBulk';
import {
  AssignedBulkRegisterContext,
  AssignedRowSelectContext,
  type AssignedBulkAction,
  type AssignedBulkOps,
  type AssignedBulkUndo,
} from './assignedBulkContext';
import { LibrarySelectToggle } from '../LibrarySelectToggle';

export interface AssignedListItem {
  id: string;
  status: AssignedStatus;
  /** A view-only share: no Move to Done or Publish scores. */
  viewOnly?: boolean;
}

interface AssignedListProps<T extends AssignedListItem> {
  items: readonly T[];
  loading: boolean;
  /** D17: a just-assigned row sits on top of Active. */
  pinnedId?: string | null;
  renderRow: (item: T, index: number) => React.ReactNode;
  emptyTitle: string;
  emptySub: string;
  tourWidgetType: string;
  /** D11: renders a class left open (usually `AssignedLeftOpenFlag`); omitted shows no flags. */
  renderLeftOpen?: (
    item: T,
    cls: AssignedClass,
    index: number,
    leaveOpen: () => void
  ) => React.ReactNode;
  /** Turns on selecting several rows. `remove` deletes them and resolves to how many failed. */
  bulk?: {
    remove: (items: T[]) => Promise<number>;
    /** Opens the publish dialog once for these closed rows. */
    publish?: (items: T[]) => void;
    /** Rows that can never publish (no scores); they are left out silently. */
    canPublish?: (item: T) => boolean;
  };
}

const plural = (n: number) => `${n} assignment${n === 1 ? '' : 's'}`;

const SectionLabel: React.FC<{ label: string; count: number }> = ({
  label,
  count,
}) => (
  <>
    {label}
    <span
      className="rounded-full bg-slate-100 tabular-nums"
      style={{ padding: 'min(1px, 0.3cqmin) min(7px, 1.6cqmin)' }}
    >
      {count}
    </span>
  </>
);

const SECTION_CLASS =
  'flex items-center font-bold uppercase tracking-wider text-slate-500';
const SECTION_STYLE: React.CSSProperties = {
  gap: 'min(8px, 2cqmin)',
  fontSize: 'min(11px, 3.2cqmin)',
  padding: 'min(10px, 2.4cqmin) min(6px, 1.4cqmin) min(4px, 1cqmin)',
};

/** The Assigned tab body: an Active section and a collapsed Done section (ASSIGNED_TAB.md D12, D13). */
export function AssignedList<T extends AssignedListItem>({
  items,
  loading,
  pinnedId,
  renderRow,
  emptyTitle,
  emptySub,
  tourWidgetType,
  renderLeftOpen,
  bulk,
}: AssignedListProps<T>): React.ReactElement {
  const [doneOpen, setDoneOpen] = useState(false);
  const [selectingOn, setSelecting] = useState(false);
  const selecting = !!bulk && selectingOn;
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const { showConfirm } = useDialog();
  const { addToast } = useDashboard();
  // Each row's latest close and move-to-done writes, read only when an action runs.
  const ops = useRef(new Map<string, AssignedBulkOps>());
  const registerFor = (id: string) => (o: AssignedBulkOps | null) => {
    if (o) ops.current.set(id, o);
    else ops.current.delete(id);
  };
  const [dismissed, setDismissed] = useState(readLeftOpenDismissals);
  const leftOpen = useMemo(() => {
    if (!renderLeftOpen) return [];
    const skip = new Set(dismissed);
    return items
      .flatMap((item) =>
        item.status.classes.flatMap((cls) =>
          cls.leftOpenSince != null &&
          !skip.has(leftOpenKey(item.id, cls.key, cls.leftOpenSince))
            ? [{ item, cls, since: cls.leftOpenSince }]
            : []
        )
      )
      .sort((a, b) => a.since - b.since);
  }, [items, dismissed, renderLeftOpen]);
  const leaveOpen = (key: string) => {
    const next = [...readLeftOpenDismissals().filter((k) => k !== key), key];
    writeLeftOpenDismissals(next);
    setDismissed(next);
  };
  const doneId = useId();
  const { active, done } = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) =>
        Number(b.id === pinnedId && b.status.bucket === 'active') -
          Number(a.id === pinnedId && a.status.bucket === 'active') ||
        compareAssigned(a.status, b.status)
    );
    return {
      active: sorted.filter((i) => i.status.bucket === 'active'),
      done: sorted.filter((i) => i.status.bucket === 'done'),
    };
  }, [items, pinnedId]);

  const shown = doneOpen ? [...active, ...done] : active;
  // Only rows on screen count, so a closed Done section is never acted on.
  const selected = shown.filter((i) => picked.has(i.id));
  const stateOf = (rows: readonly T[]): 'on' | 'off' | 'some' => {
    const n = rows.filter((i) => picked.has(i.id)).length;
    return n === 0 ? 'off' : n === rows.length ? 'on' : 'some';
  };
  const setMany = (rows: readonly T[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  const toggleOne = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setPicked(new Set());
    setSelecting(false);
  };
  const runBulk = async (action: AssignedBulkAction) => {
    if (action.confirm) {
      const { title, message, confirmLabel } = action.confirm;
      const ok = await showConfirm(message, {
        title,
        confirmLabel,
        variant: action.destructive ? 'danger' : undefined,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await action.run();
      setPicked(new Set());
    } finally {
      setBusy(false);
    }
  };
  /** Runs one op on every picked row that has it, then offers one Undo for all. */
  const runOps = async (
    pick: (o: AssignedBulkOps) => (() => Promise<AssignedBulkUndo>) | undefined,
    done: (n: number) => string,
    failed: (n: number) => string
  ) => {
    const fns = selected.flatMap((i) => {
      const o = ops.current.get(i.id);
      const fn = o && pick(o);
      return fn ? [fn] : [];
    });
    if (fns.length === 0) return;
    const results = await Promise.allSettled(fns.map((fn) => fn()));
    const undos = results.flatMap((r) =>
      r.status === 'fulfilled' ? [r.value] : []
    );
    const bad = results.length - undos.length;
    for (const r of results)
      if (r.status === 'rejected') logError('AssignedList.bulk', r.reason);
    // Undo puts back every row whose write can be undone.
    const back = undos.filter((u) => u != null);
    if (undos.length > 0)
      addToast(
        done(undos.length),
        'success',
        back.length > 0
          ? {
              label: 'Undo',
              onClick: () => {
                void Promise.allSettled(back.map((u) => u())).then((rs) => {
                  const k = rs.filter((r) => r.status === 'rejected').length;
                  if (k > 0)
                    addToast(`${plural(k)} could not be undone.`, 'error');
                });
              },
            }
          : undefined
      );
    if (bad > 0) addToast(failed(bad), 'error');
  };
  // Shown from each row's status; rows whose host has no such write are skipped.
  const canClose = selected.some((i) =>
    i.status.classes.some((c) => c.status !== 'closed')
  );
  const canMove = selected.some(
    (i) => i.status.bucket === 'active' && !i.viewOnly
  );
  const isClosed = (i: T) =>
    i.status.classes.every((c) => c.status === 'closed');
  const scored = selected.filter(
    (i) => !i.viewOnly && (bulk?.canPublish?.(i) ?? true)
  );
  const publishable = scored.filter(isClosed);
  const openSkipped = scored.length - publishable.length;
  const n = selected.length;
  const actions: AssignedBulkAction[] = !bulk
    ? []
    : [
        ...(canClose
          ? [
              {
                id: 'close',
                label: 'Close',
                icon: PowerOff,
                run: () =>
                  runOps(
                    (o) => o.close,
                    (k) => `${plural(k)} closed.`,
                    (k) => `${plural(k)} could not be closed.`
                  ),
              },
            ]
          : []),
        ...(canMove
          ? [
              {
                id: 'move-to-done',
                label: 'Move to Done',
                icon: CheckCircle2,
                run: () =>
                  runOps(
                    (o) => o.moveToDone,
                    (k) => `${k} moved to Done.`,
                    (k) => `${plural(k)} could not be moved.`
                  ),
              },
            ]
          : []),
        ...(bulk.publish && publishable.length > 0
          ? [
              {
                id: 'publish',
                label: 'Publish scores',
                icon: Send,
                run: () => {
                  bulk.publish?.(publishable);
                  if (openSkipped > 0)
                    addToast(
                      `${plural(openSkipped)} ${openSkipped === 1 ? 'was' : 'were'} skipped. ${openSkipped === 1 ? 'It is' : 'They are'} not closed yet.`,
                      'info'
                    );
                },
              },
            ]
          : []),
        {
          id: 'delete',
          label: 'Delete',
          icon: Trash2,
          destructive: true,
          confirm: {
            title: `Delete ${plural(n)}?`,
            message:
              'Their student responses are deleted too. You cannot undo this.',
            confirmLabel: 'Delete',
          },
          run: async () => {
            const items = selected;
            let bad = items.length;
            try {
              bad = await bulk.remove(items);
            } catch (err) {
              logError('AssignedList.bulkDelete', err);
            }
            const ok = items.length - bad;
            if (ok > 0) addToast(`${plural(ok)} deleted.`, 'success');
            if (bad > 0)
              addToast(`${plural(bad)} could not be deleted.`, 'error');
          },
        },
      ];
  const allState = stateOf(shown);
  const bar = selecting && (
    <AssignedBulkBar
      count={selected.length}
      allState={allState}
      onAll={() => setMany(shown, allState !== 'on')}
      actions={actions}
      busy={busy}
      onRun={(a) => void runBulk(a)}
      onCancel={stopSelecting}
      tourWidgetType={tourWidgetType}
    />
  );
  const wrap = (item: T, node: React.ReactNode) =>
    !bulk ? (
      node
    ) : (
      <AssignedBulkRegisterContext.Provider value={registerFor(item.id)}>
        <AssignedRowSelectContext.Provider
          value={
            selecting
              ? {
                  selected: picked.has(item.id),
                  toggle: () => toggleOne(item.id),
                }
              : null
          }
        >
          {node}
        </AssignedRowSelectContext.Provider>
      </AssignedBulkRegisterContext.Provider>
    );
  const selectToggle = bulk && !selecting && (
    <span className="ml-auto normal-case tracking-normal">
      <LibrarySelectToggle
        selectionMode={false}
        onChange={() => setSelecting(true)}
        anchor={tourTypeAttr('library-shell.assigned-select', tourWidgetType)}
      />
    </span>
  );

  if (loading && items.length === 0) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center text-brand-blue-primary/60"
        style={{ gap: 'min(12px, 3cqmin)', padding: 'min(40px, 10cqmin) 0' }}
      >
        <Loader2
          className="animate-spin"
          style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
        />
        <span style={{ fontSize: 'min(14px, 5.5cqmin)' }}>
          Loading assignments…
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {bar}
      {renderLeftOpen &&
        leftOpen.map(({ item, cls, since }, i) => {
          const key = leftOpenKey(item.id, cls.key, since);
          return (
            <React.Fragment key={key}>
              {renderLeftOpen(item, cls, i, () => leaveOpen(key))}
            </React.Fragment>
          );
        })}
      <div className={SECTION_CLASS} style={SECTION_STYLE}>
        <SectionLabel label="Active" count={active.length} />
        {selectToggle}
      </div>
      {active.length === 0 ? (
        <ScaledEmptyState icon={Inbox} title={emptyTitle} subtitle={emptySub} />
      ) : (
        active.map((item, i) => (
          <React.Fragment key={item.id}>
            {wrap(item, renderRow(item, i))}
          </React.Fragment>
        ))
      )}
      {done.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setDoneOpen((v) => !v)}
            aria-expanded={doneOpen}
            aria-controls={doneId}
            {...tourFieldAttr(
              'library-shell.assigned-done-section',
              tourWidgetType,
              'done'
            )}
            className={`${SECTION_CLASS} rounded-md text-left transition-colors hover:text-brand-blue-primary`}
            style={{ ...SECTION_STYLE, marginTop: 'min(8px, 2cqmin)' }}
          >
            <ChevronRight
              aria-hidden="true"
              className={`transition-transform ${doneOpen ? 'rotate-90' : ''}`}
              style={{
                width: 'min(14px, 4cqmin)',
                height: 'min(14px, 4cqmin)',
              }}
            />
            <SectionLabel label="Done" count={done.length} />
          </button>
          {doneOpen && (
            <div id={doneId}>
              {done.map((item, i) => (
                <React.Fragment key={item.id}>
                  {wrap(item, renderRow(item, active.length + i))}
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
