import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Btn,
  EmptyState,
  Field,
  Input,
  LocalModal,
  Select,
  ViewHeader,
  type AccentColor,
} from '@/components/admin/Organization/components/primitives';
import {
  EMPTY_MEDIA_FILTERS,
  mediaRowKey,
  useOrgMediaResponses,
  type DeleteProgress,
  type MediaDeleteResult,
  type MediaResponseRow,
  type MediaReviewFilters,
  type MediaTeacherOption,
} from '@/hooks/useOrgMediaResponses';
import { countDeletableTakes } from '@/components/admin/Organization/lib/mediaTakes';

// The console lists whatever `artifactArchive` entries exist and deletes them
// as a set (every take of one question for one student). It is compliance
// tooling, so it is deliberately NOT gated on the `quiz-media-response`
// feature flag — it must still clean up media recorded before it was turned off.

const STATUS_COLOR: Record<string, AccentColor> = {
  archived: 'emerald',
  syncing: 'amber',
  failed: 'rose',
  lost: 'rose',
  deleting: 'amber',
  deleted: 'slate',
  'delete-failed': 'rose',
};

export interface MediaReviewViewProps {
  rows: MediaResponseRow[];
  teachers: MediaTeacherOption[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  deleting: boolean;
  deleteProgress?: DeleteProgress | null;
  filters: MediaReviewFilters;
  results: MediaDeleteResult[] | null;
  onFiltersChange: (next: MediaReviewFilters) => void;
  onReload: () => void;
  onDismissResults: () => void;
  onDelete: (rows: MediaResponseRow[]) => void;
}

export const MediaReviewView: React.FC<MediaReviewViewProps> = ({
  rows,
  teachers,
  loading,
  error,
  truncated,
  deleting,
  deleteProgress,
  filters,
  results,
  onFiltersChange,
  onReload,
  onDismissResults,
  onDelete,
}) => {
  const { t } = useTranslation();
  // Prompt text where the session still has it; the raw id is the fallback.
  const questionLabel = (row: MediaResponseRow) =>
    row.questionText?.trim() ? row.questionText : row.questionId;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const confirmWord = t('admin.mediaReview.confirmWord');
  const selectableRows = useMemo(
    () => rows.filter((r) => countDeletableTakes(r) > 0),
    [rows]
  );
  const selectedRows = useMemo(
    () => selectableRows.filter((r) => selected.has(mediaRowKey(r))),
    [selectableRows, selected]
  );
  const selectedFileCount = useMemo(
    () => selectedRows.reduce((sum, r) => sum + countDeletableTakes(r), 0),
    [selectedRows]
  );
  const selectedTeachers = useMemo(
    () => [...new Set(selectedRows.map((r) => r.teacherEmail).filter(Boolean))],
    [selectedRows]
  );

  const toggleRow = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const allSelected =
    selectableRows.length > 0 && selectedRows.length === selectableRows.length;
  const toggleAll = () => {
    setSelected(
      allSelected ? new Set() : new Set(selectableRows.map(mediaRowKey))
    );
  };

  const closeConfirm = () => {
    setConfirming(false);
    setTyped('');
  };

  const runDelete = () => {
    const targets = selectedRows;
    closeConfirm();
    setSelected(new Set());
    onDelete(targets);
  };

  const setFilter = (patch: Partial<MediaReviewFilters>) =>
    onFiltersChange({ ...filters, ...patch });

  const failures = (results ?? []).filter((r) => r.status === 'failed');
  const deletedCount = (results ?? []).filter(
    (r) => r.status === 'deleted'
  ).length;

  return (
    <div>
      <ViewHeader
        title={t('admin.mediaReview.title')}
        blurb={t('admin.mediaReview.blurb')}
        actions={
          <Btn
            variant="secondary"
            icon={<RefreshCw size={14} aria-hidden />}
            onClick={onReload}
            disabled={loading}
          >
            {t('admin.mediaReview.refresh')}
          </Btn>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field
          label={t('admin.mediaReview.filterTeacher')}
          htmlFor="mr-teacher"
        >
          <Select
            id="mr-teacher"
            value={filters.teacherUid}
            onChange={(e) => setFilter({ teacherUid: e.target.value })}
          >
            <option value="">{t('admin.mediaReview.allTeachers')}</option>
            {teachers.map((teacher) => (
              <option key={teacher.uid} value={teacher.uid}>
                {teacher.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.mediaReview.filterAfter')} htmlFor="mr-after">
          <Input
            id="mr-after"
            type="date"
            value={filters.afterDate}
            onChange={(e) => setFilter({ afterDate: e.target.value })}
          />
        </Field>
        <Field label={t('admin.mediaReview.filterBefore')} htmlFor="mr-before">
          <Input
            id="mr-before"
            type="date"
            value={filters.beforeDate}
            onChange={(e) => setFilter({ beforeDate: e.target.value })}
          />
        </Field>
      </div>

      {(filters.teacherUid || filters.afterDate || filters.beforeDate) && (
        <div className="mb-4">
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => onFiltersChange(EMPTY_MEDIA_FILTERS)}
          >
            {t('admin.mediaReview.clearFilters')}
          </Btn>
        </div>
      )}

      {results && (
        <div
          role="status"
          className={`mb-4 rounded-xl border p-4 ${
            failures.length > 0
              ? 'border-rose-200 bg-rose-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-900">
                {t('admin.mediaReview.resultsTitle', {
                  deleted: deletedCount,
                  failed: failures.length,
                })}
              </div>
              {failures.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-rose-900">
                  {failures.map((failure) => (
                    <li
                      key={`${failure.responseKey}-${failure.artifactId}`}
                      className="flex items-start gap-1.5"
                    >
                      <XCircle
                        size={13}
                        className="text-brand-red mt-0.5 shrink-0"
                        aria-hidden
                      />
                      <span>
                        {failure.questionId ||
                          t('admin.mediaReview.requestFailed')}{' '}
                        — {failure.error}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Btn variant="ghost" size="sm" onClick={onDismissResults}>
              {t('admin.mediaReview.dismiss')}
            </Btn>
          </div>
        </div>
      )}

      {truncated && !loading && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle
            size={14}
            className="text-amber-600 mt-0.5"
            aria-hidden
          />
          {t('admin.mediaReview.truncated')}
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500"
        >
          {t('admin.mediaReview.loading')}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="text-brand-red mt-0.5"
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-900">
                {t('admin.mediaReview.errorTitle')}
              </div>
              <p className="text-xs text-slate-600 mt-1 break-words">{error}</p>
              <div className="mt-3">
                <Btn variant="secondary" size="sm" onClick={onReload}>
                  {t('admin.mediaReview.retry')}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={26} />}
          title={t('admin.mediaReview.emptyTitle')}
          message={t('admin.mediaReview.emptyMessage')}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('admin.mediaReview.rowCount', { count: rows.length })}
            </div>
            <Btn
              variant="danger"
              size="sm"
              icon={<Trash2 size={14} aria-hidden />}
              disabled={selectedRows.length === 0 || deleting}
              onClick={() => setConfirming(true)}
            >
              {deleting
                ? deleteProgress && deleteProgress.total > 0
                  ? t('admin.mediaReview.deletingProgress', {
                      done: deleteProgress.done,
                      total: deleteProgress.total,
                    })
                  : t('admin.mediaReview.deleting')
                : t('admin.mediaReview.deleteSelected', {
                    count: selectedRows.length,
                  })}
            </Btn>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(29,42,93,.06),0_1px_3px_rgba(29,42,93,.08)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[880px] w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={selectableRows.length === 0}
                        aria-label={t('admin.mediaReview.selectAll')}
                      />
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('admin.mediaReview.colStudent')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('admin.mediaReview.colQuestion')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('admin.mediaReview.colTeacher')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('admin.mediaReview.colTakes')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('admin.mediaReview.colStatus')}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t('admin.mediaReview.colArchived')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = mediaRowKey(row);
                    const deletable = countDeletableTakes(row);
                    return (
                      <tr
                        key={key}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                            checked={selected.has(key)}
                            disabled={deletable === 0 || deleting}
                            onChange={() => toggleRow(key)}
                            aria-label={t('admin.mediaReview.selectRow', {
                              student: row.studentLabel,
                              question: questionLabel(row),
                            })}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm font-semibold text-slate-800">
                            {row.studentLabel}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-[220px]">
                            {row.quizTitle}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm text-slate-800 max-w-[280px]">
                            {questionLabel(row)}
                          </div>
                          <div className="text-xs font-mono text-slate-500 truncate max-w-[280px]">
                            {row.questionId}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-sm text-slate-700 break-all">
                          {row.teacherEmail || '—'}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge color="indigo">
                            {t('admin.mediaReview.takeCount', {
                              count: row.takes.length,
                            })}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {row.takes.map((take) => (
                              <Badge
                                key={take.artifactId}
                                color={
                                  STATUS_COLOR[take.archiveStatus] ?? 'slate'
                                }
                              >
                                {t(
                                  `admin.mediaReview.status.${take.archiveStatus}`,
                                  { defaultValue: take.archiveStatus }
                                )}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-slate-600 whitespace-nowrap">
                          {row.lastActivityAt > 0
                            ? new Date(row.lastActivityAt).toLocaleDateString()
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <LocalModal
        isOpen={confirming}
        onClose={closeConfirm}
        title={t('admin.mediaReview.confirmTitle')}
        icon={<ShieldAlert size={18} />}
        footer={
          <>
            <Btn variant="ghost" onClick={closeConfirm}>
              {t('admin.mediaReview.cancel')}
            </Btn>
            <Btn
              variant="danger"
              disabled={typed !== confirmWord || deleting}
              onClick={runDelete}
            >
              {t('admin.mediaReview.confirmDelete')}
            </Btn>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          {t('admin.mediaReview.confirmSummary', {
            files: selectedFileCount,
            sets: selectedRows.length,
            teachers: selectedTeachers.join(', ') || '—',
          })}
        </p>
        <ul className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {selectedRows.map((row) => (
            <li
              key={mediaRowKey(row)}
              className="px-3 py-2 text-xs text-slate-700 flex items-center justify-between gap-3"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  {row.studentLabel} · {questionLabel(row)} · {row.quizTitle}
                </span>
                <span className="block truncate font-mono text-slate-500">
                  {row.questionId}
                </span>
              </span>
              <span className="font-mono shrink-0 text-slate-500">
                {t('admin.mediaReview.takeCount', {
                  count: countDeletableTakes(row),
                })}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-brand-red font-semibold">
          {t('admin.mediaReview.confirmWarning')}
        </p>
        <div className="mt-4">
          <Field
            label={t('admin.mediaReview.typeToConfirm', { word: confirmWord })}
            htmlFor="mr-confirm"
          >
            <Input
              id="mr-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
            />
          </Field>
        </div>
      </LocalModal>
    </div>
  );
};

/** Container: owns the callable-backed hook so the view stays presentational. */
export const MediaReviewSection: React.FC<{ orgId: string | null }> = ({
  orgId,
}) => {
  const [filters, setFilters] =
    useState<MediaReviewFilters>(EMPTY_MEDIA_FILTERS);
  const [results, setResults] = useState<MediaDeleteResult[] | null>(null);
  const media = useOrgMediaResponses(orgId, filters);

  return (
    <MediaReviewView
      rows={media.rows}
      teachers={media.teachers}
      loading={media.loading}
      error={media.error}
      truncated={media.truncated}
      deleting={media.deleting}
      deleteProgress={media.deleteProgress}
      filters={filters}
      results={results}
      onFiltersChange={setFilters}
      onReload={media.reload}
      onDismissResults={() => setResults(null)}
      onDelete={(rows) => {
        void media
          .deleteMedia(
            rows.map((r) => ({
              sessionId: r.sessionId,
              responseKey: r.responseKey,
              questionId: r.questionId,
            }))
          )
          .then(setResults)
          .catch((err: unknown) =>
            setResults([
              {
                sessionId: '',
                responseKey: '',
                questionId: '',
                artifactId: '',
                status: 'failed',
                error: err instanceof Error ? err.message : String(err),
              },
            ])
          );
      }}
    />
  );
};
