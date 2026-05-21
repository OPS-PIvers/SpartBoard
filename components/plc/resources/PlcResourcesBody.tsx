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
} from 'lucide-react';
import { Plc, PlcResource, PlcResourceKind } from '@/types';
import { usePlcResources } from '@/hooks/usePlcResources';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';

interface PlcResourcesBodyProps {
  plc: Plc;
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
 * "Pushed resources" inbox for PLC members.
 * Displays resources pushed by an admin (scope='all' or targeting this PLC)
 * grouped by kind, with a per-row "Use in this PLC" action.
 *
 * v1 "Use" action coverage:
 *   - doc        → usePlcDocs().createDoc({ title, url: refId }) ✅ one-click
 *   - quiz       → navigates to Quizzes section (deep-link; full import is heavy for v1)
 *   - video-activity → navigates to Video Activities section
 *   - assignment → navigates to Assignments section
 *   - board      → navigates to a shared board (deep-link)
 */
export const PlcResourcesBody: React.FC<PlcResourcesBodyProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { resources, loading, error } = usePlcResources({ plcId: plc.id });
  const { createDoc } = usePlcDocs(plc.id);

  // Track per-resource "use" pending state
  const [usingId, setUsingId] = useState<string | null>(null);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [useErrors, setUseErrors] = useState<Record<string, string>>({});

  const handleUse = async (res: PlcResource) => {
    if (res.kind === 'doc') {
      setUsingId(res.id);
      setUseErrors((prev) => {
        const next = { ...prev };
        delete next[res.id];
        return next;
      });
      try {
        await createDoc({ title: res.title, url: res.refId });
        setUsedIds((prev) => new Set([...prev, res.id]));
      } catch (err) {
        setUseErrors((prev) => ({
          ...prev,
          [res.id]:
            err instanceof Error ? err.message : 'Failed to add document.',
        }));
      } finally {
        setUsingId(null);
      }
    } else {
      // For other kinds in v1: graceful informational message.
      // A future iteration will add one-click import helpers for
      // quiz/VA/assignment/board.
      setUseErrors((prev) => ({
        ...prev,
        [res.id]: t('plcDashboard.resources.useNotImplemented', {
          defaultValue:
            'Go to the matching section in this PLC to import this resource.',
        }),
      }));
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
                      aria-label={t('plcDashboard.resources.useAction', {
                        defaultValue: `Use ${res.title} in this PLC`,
                        title: res.title,
                      })}
                    >
                      {isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isDone ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : null}
                      {isPending
                        ? t('plcDashboard.resources.using', {
                            defaultValue: 'Adding…',
                          })
                        : isDone
                          ? t('plcDashboard.resources.used', {
                              defaultValue: 'Added',
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
