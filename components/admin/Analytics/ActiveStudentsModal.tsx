import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Loader2,
  Search,
} from 'lucide-react';
import { functions } from '@/config/firebase';
import { Modal } from '@/components/common/Modal';
import { logError } from '@/utils/logError';
import { formatRelativeTime } from './overviewMetrics';
import {
  studentsForCategory,
  type ActiveStudentsResponse,
  type StudentKpiCategory,
} from './activeStudents';

const TITLES: Record<StudentKpiCategory, string> = {
  monthlyStudents: 'Monthly Active Students',
  dailyStudents: 'Daily Active Students',
};

const NAME_MISSING = 'Name unavailable';

type SortKey = 'name' | 'teachers' | 'lastActive';

export const ActiveStudentsModal: React.FC<{
  orgId: string;
  category: StudentKpiCategory;
  onClose: () => void;
}> = ({ orgId, category, onClose }) => {
  const [result, setResult] = useState<ActiveStudentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    let cancelled = false;
    const callable = httpsCallable<{ orgId: string }, ActiveStudentsResponse>(
      functions,
      'getActiveStudentsV1'
    );
    callable({ orgId })
      .then((res) => {
        if (!cancelled) setResult(res.data);
      })
      .catch((err: unknown) => {
        logError('ActiveStudentsModal.load', err);
        if (!cancelled) {
          const code = (err as { code?: string }).code ?? '';
          setError(
            code.endsWith('permission-denied')
              ? 'Only district admins can view the student list.'
              : 'Could not load the student list. Try again later.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const categoryRows = useMemo(
    () =>
      result ? studentsForCategory(result.students, category, result.asOf) : [],
    [result, category]
  );

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? categoryRows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.teachers.some((t) => t.toLowerCase().includes(q))
        )
      : [...categoryRows];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          // Unnamed rows sort last either way.
          if (!a.name !== !b.name) return a.name ? -1 : 1;
          cmp = a.name.localeCompare(b.name);
          break;
        case 'teachers':
          cmp = (a.teachers[0] ?? '').localeCompare(b.teachers[0] ?? '');
          break;
        case 'lastActive':
          cmp = a.lastSignInMs - b.lastSignInMs;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [categoryRows, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (column: SortKey) => {
    if (sortKey !== column)
      return <ArrowDownUp className="w-3.5 h-3.5 text-slate-400" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-slate-700" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-slate-700" />
    );
  };

  const headerClass =
    'text-left px-4 py-2.5 font-semibold text-slate-600 cursor-pointer select-none hover:bg-slate-100 transition-colors';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={TITLES[category]}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4 pb-4">
        {error ? (
          <p className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </p>
        ) : !result ? (
          <p className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading students…
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by student or teacher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <p className="text-xs text-slate-500">
              Showing {displayRows.length.toLocaleString()} of{' '}
              {categoryRows.length.toLocaleString()} students
              {result.partial && ', some names could not be loaded'}
            </p>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th
                      className={headerClass}
                      onClick={() => handleSort('name')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Student {renderSortIcon('name')}
                      </span>
                    </th>
                    <th
                      className={headerClass}
                      onClick={() => handleSort('teachers')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Teachers {renderSortIcon('teachers')}
                      </span>
                    </th>
                    <th
                      className={headerClass}
                      onClick={() => handleSort('lastActive')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Last Active {renderSortIcon('lastActive')}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="text-center py-8 text-slate-400 text-sm"
                      >
                        No students match the current filters.
                      </td>
                    </tr>
                  ) : (
                    displayRows.map((r, i) => (
                      <tr
                        key={`${r.name}-${r.lastSignInMs}-${i}`}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td
                          className={`px-4 py-2.5 font-medium ${r.name ? 'text-slate-800' : 'text-slate-400'}`}
                        >
                          {r.name || NAME_MISSING}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {r.teachers.length > 0 ? r.teachers.join(', ') : '—'}
                        </td>
                        <td
                          className="px-4 py-2.5 text-slate-600 whitespace-nowrap"
                          title={new Date(r.lastSignInMs).toLocaleString()}
                        >
                          {formatRelativeTime(r.lastSignInMs)}
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
