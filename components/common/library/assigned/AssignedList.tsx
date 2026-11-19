import React, { useId, useMemo, useState } from 'react';
import { ChevronRight, Inbox, Loader2 } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { tourFieldAttr } from '@/config/tourAnchors';
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

export interface AssignedListItem {
  id: string;
  status: AssignedStatus;
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
}

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
}: AssignedListProps<T>): React.ReactElement {
  const [doneOpen, setDoneOpen] = useState(false);
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
      </div>
      {active.length === 0 ? (
        <ScaledEmptyState icon={Inbox} title={emptyTitle} subtitle={emptySub} />
      ) : (
        active.map((item, i) => (
          <React.Fragment key={item.id}>{renderRow(item, i)}</React.Fragment>
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
                  {renderRow(item, active.length + i)}
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
