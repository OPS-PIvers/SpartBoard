import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, Search } from 'lucide-react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { Modal } from '@/components/common/Modal';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { canonicalBuildingId } from '@/config/buildings';
import { formatRelativeTime } from './overviewMetrics';
import { formatChange, percentChange, type WidgetUsage } from './widgetUsage';

const NUMBER_FORMATTER = new Intl.NumberFormat();
const formatNumber = (value: number) => NUMBER_FORMATTER.format(value);

type SortKey = 'email' | 'building' | 'lastUsed';

export interface WidgetUsersRow {
  name: string;
  total: number;
  users: number;
  usage?: WidgetUsage;
}

export const ChangeLabel: React.FC<{
  current: number;
  prev: number | null | undefined;
}> = ({ current, prev }) => {
  const pct = percentChange(current, prev);
  if (pct === null) return null;
  const tone =
    pct > 0 ? 'text-emerald-700' : pct < 0 ? 'text-red-700' : 'text-slate-500';
  return <span className={`${tone} font-normal`}> ({formatChange(pct)})</span>;
};

export const WidgetUsersModal: React.FC<{
  row: WidgetUsersRow;
  buildingsByEmail: Map<string, string[]>;
  onClose: () => void;
}> = ({ row, buildingsByEmail, onClose }) => {
  const buildings = useAdminBuildings();
  const buildingName = useMemo(() => {
    const byId = new Map(buildings.map((b) => [b.id, b.name]));
    return (id: string) =>
      id === 'none'
        ? 'No building'
        : (byId.get(canonicalBuildingId(id)) ?? `Unknown (${id})`);
  }, [buildings]);
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('lastUsed');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const users = useMemo(
    () =>
      (row.usage?.users ?? []).map((u) => {
        const ids = (buildingsByEmail.get(u.email.toLowerCase()) ?? []).map(
          canonicalBuildingId
        );
        return { ...u, buildingIds: ids.length > 0 ? ids : ['none'] };
      }),
    [row.usage, buildingsByEmail]
  );

  const buildingOptions = useMemo(
    () =>
      Object.entries(row.usage?.buildings ?? {})
        .filter(([, n]) => n > 0)
        .sort(([a], [b]) =>
          a === 'none'
            ? 1
            : b === 'none'
              ? -1
              : buildingName(a).localeCompare(buildingName(b))
        ),
    [row.usage, buildingName]
  );

  const displayUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter(
      (u) =>
        (!q || u.email.toLowerCase().includes(q)) &&
        (buildingFilter === 'all' || u.buildingIds.includes(buildingFilter))
    );
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'email':
          cmp = a.email.localeCompare(b.email);
          break;
        case 'building':
          cmp = buildingName(a.buildingIds[0]).localeCompare(
            buildingName(b.buildingIds[0])
          );
          break;
        case 'lastUsed':
          cmp = a.lastUsedMs - b.lastUsedMs;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [users, search, buildingFilter, sortKey, sortDir, buildingName]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'lastUsed' ? 'desc' : 'asc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key)
      return <ArrowDownUp className="w-3.5 h-3.5 text-slate-400" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-slate-700" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-slate-700" />
    );
  };

  const header = (label: string, key: SortKey) => (
    <th
      scope="col"
      aria-sort={
        sortKey === key
          ? sortDir === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none'
      }
      className="text-left px-4 py-2.5 font-semibold text-slate-600"
    >
      <button
        {...tourFieldAttr('admin.analytics.widget-users-sort', 'admin', key)}
        type="button"
        onClick={() => handleSort(key)}
        className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
      >
        {label} {sortIcon(key)}
      </button>
    </th>
  );

  const usage = row.usage;
  const stats: { label: string; value: React.ReactNode }[] = [
    { label: 'Open', value: formatNumber(row.total) },
    {
      label: 'Daily users',
      value: usage ? (
        <>
          {formatNumber(usage.daily)}
          <ChangeLabel current={usage.daily} prev={usage.dailyPrev} />
        </>
      ) : (
        '—'
      ),
    },
    {
      label: 'Monthly users',
      value: usage ? (
        <>
          {formatNumber(usage.monthly)}
          <ChangeLabel current={usage.monthly} prev={usage.monthlyPrev} />
        </>
      ) : (
        '—'
      ),
    },
    { label: 'Users', value: formatNumber(row.users) },
  ];

  return (
    <Modal isOpen onClose={onClose} title={row.name} maxWidth="max-w-3xl">
      <div className="space-y-4 pb-4">
        <dl className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200 border-y border-slate-200">
          {stats.map((s) => (
            <div key={s.label} className="px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {s.label}
              </dt>
              <dd className="mt-1 text-lg font-semibold text-slate-900">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>

        {!usage ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Users show after the next daily update.
          </p>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  {...tourAttr('admin.analytics.widget-users-search')}
                  type="text"
                  placeholder="Search by email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                {...tourAttr('admin.analytics.widget-users-building')}
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All buildings</option>
                {buildingOptions.map(([id, n]) => (
                  <option key={id} value={id}>
                    {buildingName(id)} ({formatNumber(n)})
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-slate-500">
              Showing {formatNumber(displayUsers.length)} of{' '}
              {formatNumber(row.users)} users
            </p>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {header('Email', 'email')}
                    {header('Building', 'building')}
                    {header('Last used', 'lastUsed')}
                  </tr>
                </thead>
                <tbody>
                  {displayUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-center py-8 text-slate-400 text-sm"
                      >
                        No users match the current filters.
                      </td>
                    </tr>
                  ) : (
                    displayUsers.map((u) => (
                      <tr
                        key={u.email}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-4 py-2.5 text-slate-800 font-medium">
                          {u.email}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {u.buildingIds.map(buildingName).join(', ')}
                        </td>
                        <td
                          className="px-4 py-2.5 text-slate-600"
                          title={
                            u.lastUsedMs > 0
                              ? new Date(u.lastUsedMs).toLocaleString()
                              : undefined
                          }
                        >
                          {u.lastUsedMs > 0
                            ? formatRelativeTime(u.lastUsedMs)
                            : 'Not yet'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
