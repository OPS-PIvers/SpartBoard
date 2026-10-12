import React, { useMemo, useState } from 'react';
import { tourAttr } from '@/config/tourAnchors';
import { History, Undo2, ChevronDown, ChevronRight } from 'lucide-react';
import { logError } from '@/utils/logError';
import type { ViewAsAuditAction } from '@/types/viewAs';
import {
  revertViewAsChange,
  useViewAsLog,
  type ViewAsLogEntry,
} from './useViewAsLog';
import { formatLogValue } from './formatLogValue';

const ACTION_LABELS: Record<ViewAsAuditAction, string> = {
  view_as_start: 'Opened',
  view_as_student: 'Opened student view',
  view_as_renew: 'Renewed',
  view_as_unlock: 'Unlocked edits',
  view_as_end: 'Exited',
  view_as_save: 'Saved',
  view_as_approve: 'Approved',
  view_as_outward: 'Outward action',
  view_as_revert: 'Reverted',
};

const REVERTABLE = new Set<ViewAsAuditAction>([
  'view_as_save',
  'view_as_approve',
]);

const formatTime = (ms: number | null) =>
  ms === null
    ? ''
    : new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

const pick = (map: Record<string, unknown> | null, key: string) =>
  map && key in map ? map[key] : undefined;

const ValueCell: React.FC<{ value: unknown }> = ({ value }) => (
  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-50 px-2 py-1 font-mono text-[11px] leading-snug text-slate-800">
    {formatLogValue(value)}
  </pre>
);

interface Column {
  label: string;
  values: Record<string, unknown> | null;
}

const ChangeTable: React.FC<{ columns: Column[] }> = ({ columns }) => {
  const keys = [
    ...new Set(columns.flatMap((c) => Object.keys(c.values ?? {}))),
  ].sort();
  return (
    <div
      className="grid gap-x-3 gap-y-2 text-xs"
      style={{
        gridTemplateColumns: `minmax(6rem, auto) repeat(${columns.length}, minmax(0, 1fr))`,
      }}
    >
      <div className="font-semibold text-slate-500">Field</div>
      {columns.map((c) => (
        <div key={c.label} className="font-semibold text-slate-500">
          {c.label}
        </div>
      ))}
      {keys.map((key) => (
        <React.Fragment key={key}>
          <div className="break-all pt-1 font-mono text-[11px] text-slate-700">
            {key}
          </div>
          {columns.map((c) => (
            <ValueCell key={c.label} value={pick(c.values, key)} />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};

type RevertState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'conflict'; current: Record<string, unknown> }
  | { kind: 'missing' }
  | { kind: 'error' };

const LogRow: React.FC<{
  entry: ViewAsLogEntry;
  revertedBy: ViewAsLogEntry | undefined;
  onFilterAdmin: (email: string) => void;
  onFilterTarget: (email: string) => void;
}> = ({ entry, revertedBy, onFilterAdmin, onFilterTarget }) => {
  const [open, setOpen] = useState(false);
  const [revert, setRevert] = useState<RevertState>({ kind: 'idle' });
  const hasChange = entry.before !== null || entry.after !== null;
  const canRevert = REVERTABLE.has(entry.action) && !revertedBy;

  const run = async (force: boolean) => {
    const seen = revert.kind === 'conflict' ? revert.current : undefined;
    setRevert({ kind: 'busy' });
    try {
      const res = await revertViewAsChange(
        force ? { logId: entry.id, force, seen } : { logId: entry.id }
      );
      if (res.status === 'conflict') {
        setRevert({ kind: 'conflict', current: res.current });
        setOpen(true);
      } else if (res.status === 'missing') {
        setRevert({ kind: 'missing' });
      } else {
        setRevert({ kind: 'idle' });
      }
    } catch (err) {
      logError('ViewAsLog.revert', err, { logId: entry.id });
      setRevert({ kind: 'error' });
    }
  };

  return (
    <li className="px-4 py-3" data-testid="view-as-log-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="w-28 shrink-0 text-xs tabular-nums text-slate-500">
          {formatTime(entry.timestampMs)}
        </span>
        <span className="w-28 shrink-0 font-semibold text-slate-800">
          {ACTION_LABELS[entry.action] ?? entry.action}
        </span>
        <button
          {...tourAttr('admin.view-as-log.filter-teacher')}
          type="button"
          onClick={() => onFilterTarget(entry.targetEmail)}
          className="min-w-0 truncate text-slate-800 hover:text-brand-blue-primary hover:underline"
          title="Teacher"
        >
          {entry.targetEmail}
        </button>
        <button
          {...tourAttr('admin.view-as-log.filter-admin')}
          type="button"
          onClick={() => onFilterAdmin(entry.email)}
          className="min-w-0 truncate text-xs text-slate-500 hover:text-brand-blue-primary hover:underline"
          title="Admin"
        >
          {entry.email}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {revertedBy && (
            <span className="text-xs font-semibold text-slate-500">
              Reverted {formatTime(revertedBy.timestampMs)}
            </span>
          )}
          {revert.kind === 'missing' && (
            <span className="text-xs font-semibold text-brand-red-primary">
              No longer exists
            </span>
          )}
          {revert.kind === 'error' && (
            <span className="text-xs font-semibold text-brand-red-primary">
              Revert failed
            </span>
          )}
          {canRevert && revert.kind !== 'conflict' && (
            <button
              {...tourAttr('admin.view-as-log.revert')}
              type="button"
              disabled={revert.kind === 'busy'}
              onClick={() => void run(false)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Revert
            </button>
          )}
          {hasChange && (
            <button
              {...tourAttr('admin.view-as-log.toggle-changes')}
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? 'Hide changes' : 'Show changes'}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            >
              {open ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>
      {entry.reason && (
        <div className="mt-1 pl-0 text-xs text-slate-600 sm:pl-[15.5rem]">
          {entry.reason}
        </div>
      )}
      {open && hasChange && (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          {entry.path && (
            <div className="break-all font-mono text-[11px] text-slate-500">
              {entry.path}
            </div>
          )}
          {revert.kind === 'conflict' ? (
            <>
              <ChangeTable
                columns={[
                  { label: 'Logged', values: entry.after },
                  { label: 'Current', values: revert.current },
                  { label: 'Revert to', values: entry.before },
                ]}
              />
              <div className="flex justify-end gap-2">
                <button
                  {...tourAttr('admin.view-as-log.keep-current')}
                  type="button"
                  onClick={() => setRevert({ kind: 'idle' })}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Keep current
                </button>
                <button
                  {...tourAttr('admin.view-as-log.revert-anyway')}
                  type="button"
                  onClick={() => void run(true)}
                  className="rounded-md bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-dark"
                >
                  Revert anyway
                </button>
              </div>
            </>
          ) : (
            <ChangeTable
              columns={[
                { label: 'Before', values: entry.before },
                { label: 'After', values: entry.after },
              ]}
            />
          )}
        </div>
      )}
    </li>
  );
};

const FilterSelect: React.FC<{
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ id, label, value, options, onChange }) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-xs font-bold text-slate-700">
      {label}
    </label>
    <select
      {...tourAttr('admin.view-as-log.filter')}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-64 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
    >
      <option value="">All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </div>
);

const sortedUnique = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort();

/** Admin Settings > View as log (super admins only): every View as event, with Revert. */
export const ViewAsLogPanel: React.FC = () => {
  const [pages, setPages] = useState(1);
  const { entries, loading, error, hasMore } = useViewAsLog(pages);
  const [adminFilter, setAdminFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');

  const revertedBy = useMemo(() => {
    const map = new Map<string, ViewAsLogEntry>();
    for (const e of entries) {
      if (e.revertOf && !map.has(e.revertOf)) map.set(e.revertOf, e);
    }
    return map;
  }, [entries]);

  const admins = useMemo(
    () => sortedUnique([...entries.map((e) => e.email), adminFilter]),
    [entries, adminFilter]
  );
  const targets = useMemo(
    () => sortedUnique([...entries.map((e) => e.targetEmail), targetFilter]),
    [entries, targetFilter]
  );
  const shown = entries.filter(
    (e) =>
      (!adminFilter || e.email === adminFilter) &&
      (!targetFilter || e.targetEmail === targetFilter)
  );

  return (
    <div className="flex max-w-5xl flex-col gap-4 p-6 pb-10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary">
          <History className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">View as log</h2>
      </div>

      <div className="flex flex-wrap gap-4">
        <FilterSelect
          id="view-as-log-admin"
          label="Admin"
          value={adminFilter}
          options={admins}
          onChange={setAdminFilter}
        />
        <FilterSelect
          id="view-as-log-target"
          label="Teacher"
          value={targetFilter}
          options={targets}
          onChange={setTargetFilter}
        />
      </div>

      {error ? (
        <div className="text-sm text-brand-red-primary">
          Couldn&apos;t load the log.
        </div>
      ) : loading && entries.length === 0 ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="text-sm text-slate-500">No entries</div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {shown.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              revertedBy={revertedBy.get(entry.id)}
              onFilterAdmin={setAdminFilter}
              onFilterTarget={setTargetFilter}
            />
          ))}
        </ul>
      )}

      {hasMore && !error && (
        <button
          {...tourAttr('admin.view-as-log.load-more')}
          type="button"
          onClick={() => setPages((p) => p + 1)}
          className="self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Load more
        </button>
      )}
    </div>
  );
};
