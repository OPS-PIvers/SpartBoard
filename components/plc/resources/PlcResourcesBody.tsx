import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Film,
  ClipboardList,
  FileText,
  LayoutPanelLeft,
  Sparkles,
  Check,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { Plc, PlcResource, PlcResourceKind } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcResources } from '@/hooks/usePlcResources';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { writePlcQuizEntry } from '@/hooks/usePlcQuizzes';
import { writePlcVideoActivityEntry } from '@/hooks/usePlcVideoActivities';
import { pullSyncedQuizContent } from '@/hooks/useSyncedQuizGroups';
import { pullSyncedVideoActivityContent } from '@/hooks/useSyncedVideoActivityGroups';
import { logError } from '@/utils/logError';
import { getPlcMemberEmail } from '@/utils/plc';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import type { PlcSectionId } from '../sections';

interface PlcResourcesBodyProps {
  plc: Plc;
  /** Navigate the dashboard rail to another section (deep-link "Use" path). */
  onNavigate?: (id: PlcSectionId) => void;
}

const KIND_META: Record<
  PlcResourceKind,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  quiz: { label: 'Quizzes', icon: BookOpen },
  'video-activity': { label: 'Video Activities', icon: Film },
  assignment: { label: 'Assignments', icon: ClipboardList },
  doc: { label: 'Documents', icon: FileText },
  board: { label: 'Boards', icon: LayoutPanelLeft },
};

const KIND_ORDER: PlcResourceKind[] = [
  'doc',
  'quiz',
  'video-activity',
  'assignment',
  'board',
];

/**
 * Kinds whose canonical source we can resolve from `refId` and write
 * straight into the PLC's shared library in one click. `doc`/`quiz`/
 * `video-activity` all have a clean `writePlc*` import path.
 */
const ONE_CLICK_KINDS: ReadonlySet<PlcResourceKind> = new Set([
  'doc',
  'quiz',
  'video-activity',
]);

/**
 * Kinds where the admin-entered `refId` is a hand-typed id with
 * incomplete metadata (no session settings / no board snapshot), so a
 * one-click import is unreliable. These deep-link to the matching
 * section, where the existing per-row import UI handles the import.
 */
const DEEP_LINK_TARGET: Partial<Record<PlcResourceKind, PlcSectionId>> = {
  // The standalone Assignments section was collapsed into the unified
  // Assessments section (Decision 4.5). A pushed `assignment` resource is a
  // generic hand-typed id with no quiz/video discriminator, so route it to the
  // Assessments section — its In-progress / Completed sub-tabs surface the
  // full assignment index and per-row import UI.
  assignment: 'assessments',
  board: 'sharedBoards',
};

/**
 * "Pushed resources" inbox for PLC members.
 * Displays resources pushed by an admin (scope='all' or targeting this PLC)
 * grouped by kind, with a per-row action.
 *
 * "Use" action coverage:
 *   - doc            → usePlcDocs().createDoc({ title, url: refId }) — one-click
 *   - quiz           → pull canonical synced group → writePlcQuizEntry — one-click
 *   - video-activity → pull canonical synced group → writePlcVideoActivityEntry — one-click
 *   - assignment     → deep-link to the Quizzes section
 *   - board          → deep-link to the Shared Boards section
 *
 * One-click imports write a single PLC-library entry (all members benefit);
 * teammates then pull it into their personal board with the per-row import
 * buttons already in each section. We keep no extra Firestore listeners here
 * (cost posture) — duplicate-add within a session is guarded by local
 * `usedIds`; re-adds across sessions are a low-risk edge case.
 */
export const PlcResourcesBody: React.FC<PlcResourcesBodyProps> = ({
  plc,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { resources, loading, error } = usePlcResources({ plcId: plc.id });
  const { createDoc } = usePlcDocs(plc.id);

  // Track per-resource "use" pending / done / error state.
  const [usingId, setUsingId] = useState<string | null>(null);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [useErrors, setUseErrors] = useState<Record<string, string>>({});

  const markUsed = (id: string) => setUsedIds((prev) => new Set([...prev, id]));
  const clearError = (id: string) =>
    setUseErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  const setError = (id: string, message: string) =>
    setUseErrors((prev) => ({ ...prev, [id]: message }));

  const importOneClick = async (res: PlcResource): Promise<void> => {
    if (res.kind === 'doc') {
      await createDoc({ title: res.title, url: res.refId });
      return;
    }

    const uid = user?.uid;
    if (!uid) throw new Error('Not signed in.');
    const sharedByName = user?.displayName ?? '';
    const sharedByEmail =
      getPlcMemberEmail(plc, uid) ??
      (user?.email ? user.email.toLowerCase() : '');

    if (res.kind === 'quiz') {
      const canonical = await pullSyncedQuizContent(res.refId);
      await writePlcQuizEntry(plc.id, uid, {
        plcQuizId: crypto.randomUUID(),
        syncGroupId: res.refId,
        title: canonical.title || res.title,
        questionCount: canonical.questions.length,
        sharedByName,
        sharedByEmail,
      });
      return;
    }

    if (res.kind === 'video-activity') {
      const canonical = await pullSyncedVideoActivityContent(res.refId);
      await writePlcVideoActivityEntry(plc.id, uid, {
        plcVideoActivityId: crypto.randomUUID(),
        syncGroupId: res.refId,
        title: canonical.title || res.title,
        youtubeUrl: canonical.youtubeUrl,
        questionCount: canonical.questions.length,
        sharedByName,
        sharedByEmail,
      });
      return;
    }
  };

  const handleUse = async (res: PlcResource) => {
    // Deep-link kinds: route to the matching section.
    const deepLinkTarget = DEEP_LINK_TARGET[res.kind];
    if (deepLinkTarget) {
      onNavigate?.(deepLinkTarget);
      return;
    }

    setUsingId(res.id);
    clearError(res.id);
    try {
      await importOneClick(res);
      markUsed(res.id);
      addToast(
        t('plcDashboard.resources.useSuccess', {
          title: res.title,
          defaultValue: '"{{title}}" added to this PLC.',
        }),
        'success'
      );
    } catch (err) {
      logError('PlcResourcesBody.use', err, {
        plcId: plc.id,
        resourceId: res.id,
        kind: res.kind,
      });
      setError(
        res.id,
        err instanceof Error
          ? err.message
          : t('plcDashboard.resources.useFailed', {
              defaultValue: 'Failed to add this resource.',
            })
      );
    } finally {
      setUsingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">
          {t('plcDashboard.resources.loading', {
            defaultValue: 'Loading resources…',
          })}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600" role="alert">
          {t('plcDashboard.resources.loadError', {
            defaultValue: 'Failed to load resources.',
          })}
        </p>
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <ScaledEmptyState
        icon={Sparkles}
        title={t('plcDashboard.resources.emptyTitle', {
          defaultValue: 'No Resources Yet',
        })}
        subtitle={t('plcDashboard.resources.emptySubtitle', {
          defaultValue:
            'Your admin will push curated quizzes, docs, and boards here.',
        })}
      />
    );
  }

  // Group by kind in defined order
  const grouped = KIND_ORDER.reduce<Record<PlcResourceKind, PlcResource[]>>(
    (acc, kind) => {
      acc[kind] = resources.filter((r) => r.kind === kind);
      return acc;
    },
    {} as Record<PlcResourceKind, PlcResource[]>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {t('plcDashboard.resources.inboxTitle', {
            defaultValue: 'Resources',
          })}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {t('plcDashboard.resources.inboxSubtitle', {
            defaultValue:
              'Curated by your admin. Click "Use" to add to your PLC.',
          })}
        </p>
      </div>

      {KIND_ORDER.map((kind) => {
        const group = grouped[kind];
        if (!group || group.length === 0) return null;
        const { label, icon: KindIcon } = KIND_META[kind];
        const isDeepLink = !ONE_CLICK_KINDS.has(kind);
        return (
          <section key={kind} aria-label={label}>
            <div className="flex items-center gap-2 mb-3">
              <KindIcon className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                {t(`plcDashboard.resources.kind.${kind}`, {
                  defaultValue: label,
                })}
              </h3>
            </div>
            <ul className="space-y-2">
              {group.map((res) => {
                const isPending = usingId === res.id;
                const isDone = usedIds.has(res.id);
                const useError = useErrors[res.id];
                return (
                  <li
                    key={res.id}
                    className="flex items-start justify-between gap-3 bg-white/70 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 text-sm truncate">
                        {res.title}
                      </p>
                      {res.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {res.description}
                        </p>
                      )}
                      {useError && (
                        <p
                          className="text-xs text-amber-600 mt-1"
                          role="status"
                        >
                          {useError}
                        </p>
                      )}
                      {isDone && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          {t('plcDashboard.resources.used', {
                            defaultValue: 'Added to your PLC',
                          })}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleUse(res)}
                      disabled={isPending || isDone}
                      className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:text-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-lg hover:bg-brand-blue-primary/10"
                      aria-label={
                        isDeepLink
                          ? t('plcDashboard.resources.openAction', {
                              title: res.title,
                              defaultValue: `Open ${res.title} in this PLC`,
                            })
                          : t('plcDashboard.resources.useAction', {
                              title: res.title,
                              defaultValue: `Use ${res.title} in this PLC`,
                            })
                      }
                    >
                      {isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isDone ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : isDeepLink ? (
                        <ArrowRight className="w-3.5 h-3.5" />
                      ) : null}
                      {isPending
                        ? t('plcDashboard.resources.using', {
                            defaultValue: 'Adding…',
                          })
                        : isDone
                          ? t('plcDashboard.resources.used', {
                              defaultValue: 'Added',
                            })
                          : isDeepLink
                            ? t('plcDashboard.resources.open', {
                                defaultValue: 'Open',
                              })
                            : t('plcDashboard.resources.use', {
                                defaultValue: 'Use',
                              })}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
};
