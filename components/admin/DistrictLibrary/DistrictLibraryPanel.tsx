// Admin Settings > District library (docs/plans/QUIZ_MCA_PRACTICE.md M29, M31).
import React, { useMemo, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Library,
  ListChecks,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  deleteDistrictLibraryItem,
  publishDistrictPackage,
  saveDistrictLibraryTargeting,
  setDistrictLibraryStatus,
  previewPackageChanges,
  useDistrictLibraryItems,
  type PublishProgress,
  type QuestionChanges,
} from '@/hooks/useDistrictLibraryAdmin';
import {
  readDistrictPackage,
  type ReadDistrictPackage,
} from '@/utils/districtLibraryPackageReader';
import {
  checkPackageUpload,
  planPackageUpload,
  type UploadProblem,
} from '@/utils/districtLibraryPublish';
import { isSiteAdminActor } from '@/utils/superAdmin';
import {
  describeTargeting,
  targetsNobody,
} from '@/utils/districtLibraryTargeting';
import { canonicalBuildingId } from '@/config/buildings';
import type { DistrictLibraryItem } from '@/types/districtLibrary';
import { DistrictLibraryTargetingEditor } from './DistrictLibraryTargetingEditor';

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

interface PendingUpload {
  fileName: string;
  pkg: ReadDistrictPackage;
  /** Set for Replace: only this item is updated. */
  onlyId?: string;
  /** Question ids each replaced item loses and gains. */
  changes: QuestionChanges;
}

const iconButton =
  'touch-target-expand inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50';

export const DistrictLibraryPanel: React.FC = () => {
  const { user, isAdmin, roleId, orgId } = useAuth();
  const { showConfirm } = useDialog();
  const buildings = useAdminBuildings();
  const siteAdmin = isSiteAdminActor(isAdmin, roleId, orgId);
  const { items, loading, error } = useDistrictLibraryItems(siteAdmin);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [failed, setFailed] = useState<UploadProblem[]>([]);

  const byId = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const buildingName = (id: string): string =>
    buildings.find((b) => b.id === canonicalBuildingId(id))?.name ?? id;

  const pickFile = (onlyId?: string) => {
    replaceTarget.current = onlyId ?? null;
    setMessage(null);
    setProblems(null);
    setFailed([]);
    fileInput.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const onlyId = replaceTarget.current ?? undefined;
    const result = await readDistrictPackage(file);
    if (!result.ok) {
      setProblems(result.errors);
      return;
    }
    if (
      onlyId &&
      !result.pkg.contents.manifest.entries.some((e) => e.id === onlyId)
    ) {
      setProblems([
        `This package does not contain "${byId.get(onlyId)?.title ?? onlyId}".`,
      ]);
      return;
    }
    try {
      const changes = await previewPackageChanges(result.pkg, byId);
      setPending({ fileName: file.name, pkg: result.pkg, onlyId, changes });
    } catch (err) {
      setProblems([
        err instanceof Error
          ? err.message
          : 'Could not compare with the library.',
      ]);
    }
  };

  const runUpload = async () => {
    if (!pending || !user) return;
    setActionError(null);
    const removedCount = plan.reduce(
      (n, p) => n + (pending.changes[p.entry.id]?.removed.length ?? 0),
      0
    );
    if (removedCount > 0) {
      const ok = await showConfirm(
        `This removes ${removedCount} ${removedCount === 1 ? 'question' : 'questions'} from teachers' copies. Open assignments keep them unless a teacher syncs the assignment to the latest version. Continue?`,
        {
          title: 'Remove questions',
          confirmLabel: 'Continue',
          variant: 'warning',
        }
      );
      if (!ok) return;
    }
    try {
      const result = await publishDistrictPackage(pending.pkg, user.uid, {
        onlyIds: pending.onlyId ? new Set([pending.onlyId]) : undefined,
        onProgress: setProgress,
      });
      const parts = [
        result.added.length > 0 ? `${result.added.length} added as drafts` : '',
        result.updated.length > 0 ? `${result.updated.length} updated` : '',
      ].filter(Boolean);
      setMessage(parts.length > 0 ? `${parts.join(', ')}.` : null);
      setFailed(result.failed);
      // Keep the review open on failure so Add to library retries with the same ids.
      if (result.failed.length === 0) setPending(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setProgress(null);
    }
  };

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusyId(null);
    }
  };

  const togglePublished = async (item: DistrictLibraryItem) => {
    if (!user) return;
    if (item.status === 'draft' && targetsNobody(item)) {
      const ok = await showConfirm(
        `"${item.title}" reaches nobody yet. Publish it anyway? Choose who sees it to send it to teachers.`,
        { title: 'Publish', confirmLabel: 'Publish' }
      );
      if (!ok) return;
    }
    if (item.status === 'published') {
      const ok = await showConfirm(
        `Unpublish "${item.title}"? Teachers can no longer find it. Teachers who already added it keep their copy and still get corrections.`,
        { title: 'Unpublish', confirmLabel: 'Unpublish', variant: 'warning' }
      );
      if (!ok) return;
    }
    await withBusy(item.id, () =>
      setDistrictLibraryStatus(
        item.id,
        item.status === 'published' ? 'draft' : 'published',
        user.uid
      )
    );
  };

  const remove = async (item: DistrictLibraryItem) => {
    const ok = await showConfirm(
      `Delete "${item.title}"? Teachers who added it keep their copy as it is now and assigned quizzes keep working, but corrections stop. Nobody else can find it.`,
      { title: 'Delete', confirmLabel: 'Delete', variant: 'danger' }
    );
    if (!ok) return;
    await withBusy(item.id, () => deleteDistrictLibraryItem(item.id));
  };

  const plan = pending
    ? planPackageUpload(
        pending.pkg.contents.manifest.entries.filter(
          (e) => !pending.onlyId || e.id === pending.onlyId
        ),
        byId
      )
    : [];
  const blocked = pending
    ? checkPackageUpload(
        pending.pkg.contents.manifest,
        pending.pkg.contents.files,
        byId,
        pending.onlyId ? new Set([pending.onlyId]) : undefined
      )
    : [];
  // Rows in the package being saved can't be published, retargeted or replaced until it finishes.
  const uploadingIds = new Set(progress ? plan.map((p) => p.entry.id) : []);

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <Library className="w-5 h-5 text-brand-blue-primary" aria-hidden />
        <h3 className="text-lg font-bold text-slate-900">District library</h3>
        <button
          type="button"
          onClick={() => pickFile()}
          disabled={!!pending || !!progress}
          {...tourAttr('admin.district-library.upload')}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
        >
          <Upload className="w-4 h-4" aria-hidden />
          Upload package file
        </button>
        {/* no-tour-anchor: hidden file input opened by the Upload and Replace buttons */}
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void onFile(file);
          }}
        />
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Only staff in the district can open these items. New items start as
        drafts.
      </p>

      {problems && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3"
        >
          <p className="text-sm font-semibold text-red-800">
            This package can&apos;t be used.
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-red-700 max-h-48 overflow-y-auto">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {message && (
        <p className="mb-4 text-sm font-semibold text-emerald-700">{message}</p>
      )}
      {actionError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {actionError}
        </p>
      )}
      {failed.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3"
        >
          <p className="text-sm font-semibold text-red-800">
            {failed.length === 1
              ? '1 item was not saved.'
              : `${failed.length} items were not saved.`}{' '}
            Fix the package or try again.
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-red-700 max-h-48 overflow-y-auto">
            {failed.map((f) => (
              <li key={f.id}>
                {f.title}: {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pending && (
        <section className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-900">
            {pending.pkg.contents.manifest.title}
          </h4>
          <p className="text-xs text-slate-500">
            {pending.fileName} · made{' '}
            {formatDate(pending.pkg.contents.manifest.generatedAt)}
          </p>
          <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {plan.map(({ entry, action }) => {
              const change = pending.changes[entry.id];
              const problem = blocked.find((b) => b.id === entry.id);
              return (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 text-slate-800">
                    <span className="block truncate">{entry.title}</span>
                    {change &&
                      (change.removed.length > 0 ||
                        change.added.length > 0) && (
                        <span
                          className="block text-xs text-slate-500"
                          title={[
                            change.removed.length > 0
                              ? `Removed: ${change.removed.join(', ')}`
                              : '',
                            change.added.length > 0
                              ? `Added: ${change.added.join(', ')}`
                              : '',
                          ]
                            .filter(Boolean)
                            .join('\n')}
                        >
                          {change.removed.length > 0 && (
                            <span className="font-semibold text-red-700">
                              {change.removed.length} removed
                            </span>
                          )}
                          {change.removed.length > 0 &&
                            change.added.length > 0 &&
                            ' · '}
                          {change.added.length > 0 &&
                            `${change.added.length} added`}
                        </span>
                      )}
                    {problem && (
                      <span className="block text-xs text-red-700">
                        {problem.message}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                    {entry.kind === 'quiz' ? 'Quiz' : 'Bank'} ·{' '}
                    {entry.questionCount} q ·{' '}
                    <span
                      className={
                        action === 'add'
                          ? 'font-semibold text-emerald-700'
                          : 'font-semibold text-amber-700'
                      }
                    >
                      {action === 'add' ? 'New' : 'Replaces current'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {pending.pkg.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
              {pending.pkg.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {plan.some((p) => p.action === 'update') && (
            <p className="mt-2 text-xs text-slate-600">
              Replaced items reach teachers&apos; copies right away. Quizzes
              already assigned keep the version they were assigned with.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runUpload()}
              disabled={!!progress || blocked.length > 0}
              {...tourAttr('admin.district-library.confirm-upload')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {progress && (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              )}
              {progress
                ? `Saving ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
                : 'Add to library'}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={!!progress}
              {...tourAttr('admin.district-library.cancel-upload')}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">
            No library items yet
          </p>
          <p className="text-sm text-slate-500">
            Upload a package file to add quizzes and question banks.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {items.map((item) => {
            const busy = busyId === item.id || uploadingIds.has(item.id);
            const KindIcon = item.kind === 'quiz' ? ListChecks : Library;
            return (
              <li key={item.id} className="py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <KindIcon
                    className="w-5 h-5 mt-0.5 shrink-0 text-slate-400"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {item.title}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xxs font-bold uppercase tracking-wider ${
                          item.status === 'published'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.kind === 'quiz' ? 'Quiz' : 'Question bank'} ·{' '}
                      {item.questionCount} questions ·{' '}
                      {describeTargeting(item, buildingName)} · updated{' '}
                      {formatDate(item.updatedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void togglePublished(item)}
                      {...tourFieldAttr(
                        'admin.district-library.publish',
                        'admin',
                        item.id
                      )}
                      className={iconButton}
                    >
                      {item.status === 'published' ? (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden />
                      ) : (
                        <Eye className="w-3.5 h-3.5" aria-hidden />
                      )}
                      {item.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setEditingId((prev) =>
                          prev === item.id ? null : item.id
                        )
                      }
                      aria-expanded={editingId === item.id}
                      {...tourFieldAttr(
                        'admin.district-library.targeting',
                        'admin',
                        item.id
                      )}
                      className={iconButton}
                    >
                      <Users className="w-3.5 h-3.5" aria-hidden />
                      Who sees it
                    </button>
                    <button
                      type="button"
                      disabled={busy || !!pending}
                      onClick={() => pickFile(item.id)}
                      title="Replace with a corrected package file"
                      {...tourFieldAttr(
                        'admin.district-library.replace',
                        'admin',
                        item.id
                      )}
                      className={iconButton}
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                      Replace
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(item)}
                      aria-label={`Delete ${item.title}`}
                      {...tourFieldAttr(
                        'admin.district-library.delete',
                        'admin',
                        item.id
                      )}
                      className={`${iconButton} hover:text-red-700`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
                {editingId === item.id && user && !busy && (
                  <DistrictLibraryTargetingEditor
                    item={item}
                    buildings={buildings}
                    onCancel={() => setEditingId(null)}
                    onSave={async (targeting) => {
                      await saveDistrictLibraryTargeting(
                        item.id,
                        targeting,
                        buildings,
                        user.uid
                      );
                      setEditingId(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
