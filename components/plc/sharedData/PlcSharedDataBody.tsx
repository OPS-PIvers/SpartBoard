/**
 * PlcSharedDataBody — the PLC Shared Data (Data) section, rebuilt on the
 * anonymized server-side aggregate pipeline (Wave 3 — Decisions 6.0 + 3.3 +
 * 4.0c, PRD §6.2 / §3.6 / §3.3).
 *
 * WHAT CHANGED (and why):
 *   The section used to aggregate every teacher's raw `PlcContribution`
 *   client-side — those docs embed student names (the PII). It now reads the
 *   `PlcAssessmentAggregate` rollups the `aggregatePlcAssessment` Cloud Function
 *   writes at `plcs/{id}/aggregates/{assessmentId}`: anonymized team average,
 *   per-question correctness, and a per-teacher (per-class) rollup carrying
 *   counts ONLY — no student names, no per-student rows. This repointing lands
 *   BEFORE the contributions read is tightened to owner-only (PRD §9 risk
 *   ordering), so no member-facing read of raw contributions remains in this
 *   body.
 *
 * Data flow:
 *   usePlcAggregatesData  →  anonymized rollups (the RESULT CARDS)
 *   usePlcAssessmentsData →  designated common assessments (title/kind/unit/status,
 *                            and the join key the aggregator uses for the doc id)
 *   usePlcMembers         →  team roster (who-ran-it cross-reference + "you")
 *   usePlcContributions   →  the SIGNED-IN member's OWN contribution read only —
 *                            used solely to drive the per-card "updating…" state
 *                            when their just-published result outruns `ranAt`.
 *                            The owning teacher's own named roster stays available
 *                            to them through this same read (no self-view
 *                            regression); no other teacher's PII is exposed.
 *
 * Each card carries a scoped `PlcCommentsThread` keyed to
 * `assessment:<assessmentId>` (already forward-aligned in Wave 2). Cards that
 * have not yet been promoted to a first-class common assessment expose a
 * "Designate as common assessment" affordance that calls the provider
 * `designateAssessment` action.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  Sparkles,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import type { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import {
  usePlcActions,
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMembers,
} from '@/context/usePlcContext';
import { usePlcContributions } from '@/hooks/usePlcContributions';
import { canEditPlcContent } from '@/utils/plc';
import { logError } from '@/utils/logError';
import { PlcCommentsThread } from '@/components/plc/comments/PlcCommentsThread';
import { PlcSharedDataFilters } from './PlcSharedDataFilters';
import {
  buildAssessmentCards,
  collectAggregateTeachers,
  collectUnitLabels,
  filterAssessmentCards,
  latestContributionByAggregateId,
  type AssessmentDataCard,
  type SharedDataAggregateFilters,
  type SharedDataTeamMember,
} from './sharedDataSelectors';

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: SharedDataAggregateFilters = {
  type: 'all',
  teacherUid: 'all',
  unitLabel: 'all',
  status: 'all',
  search: '',
};

// ---------------------------------------------------------------------------
// Score color — shared with the projector palette (calm, glanceable).
// ---------------------------------------------------------------------------

function scoreToneClass(percent: number): string {
  if (percent >= 80) return 'text-emerald-600';
  if (percent >= 60) return 'text-amber-600';
  return 'text-brand-red-primary';
}

function barToneClass(percent: number): string {
  if (percent >= 80) return 'bg-emerald-500';
  if (percent >= 60) return 'bg-amber-500';
  return 'bg-brand-red-primary';
}

// ---------------------------------------------------------------------------
// ResultCard — one aggregate's anonymized summary card
// ---------------------------------------------------------------------------

interface ResultCardProps {
  card: AssessmentDataCard;
  plcId: string;
  canEdit: boolean;
  onDesignate: (card: AssessmentDataCard) => void;
}

const ResultCard: React.FC<ResultCardProps> = ({
  card,
  plcId,
  canEdit,
  onDesignate,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const title =
    card.title ||
    t('plcDashboard.sharedData.untitledQuiz', {
      defaultValue: 'Untitled assessment',
    });

  const KindIcon = card.kind === 'video-activity' ? Video : BookOpen;
  const kindLabel =
    card.kind === 'video-activity'
      ? t('plcDashboard.sharedData.kindVA', { defaultValue: 'Video Activity' })
      : t('plcDashboard.sharedData.kindQuiz', { defaultValue: 'Quiz' });

  return (
    <div
      data-testid="shared-data-card"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/30"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-blue-primary/10 shrink-0">
          <KindIcon
            className="w-4 h-4 text-brand-blue-primary"
            aria-hidden="true"
          />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-800 truncate">
              {title}
            </span>
            <span className="text-xxs font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {kindLabel}
            </span>
            {card.assessment?.unitLabel && (
              <span className="text-xxs font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {card.assessment.unitLabel}
              </span>
            )}
            {card.isDesignated && (
              <span className="inline-flex items-center gap-1 text-xxs font-bold uppercase tracking-wider text-brand-blue-primary bg-brand-blue-primary/10 px-1.5 py-0.5 rounded">
                <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
                {t('plcDashboard.sharedData.common', {
                  defaultValue: 'Common',
                })}
              </span>
            )}
            {card.updating && (
              <span
                className="inline-flex items-center gap-1 text-xxs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                title={t('plcDashboard.sharedData.updatingHint', {
                  defaultValue:
                    'New results are still being rolled up — numbers will refresh shortly.',
                })}
              >
                <Loader2
                  className="w-2.5 h-2.5 animate-spin"
                  aria-hidden="true"
                />
                {t('plcDashboard.sharedData.updating', {
                  defaultValue: 'updating…',
                })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xxs text-slate-500 mt-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 font-semibold`}>
              <Trophy className="w-3 h-3 text-amber-500" aria-hidden="true" />
              <span className={scoreToneClass(card.teamAveragePercent)}>
                {card.teamAveragePercent}%
              </span>{' '}
              {t('plcDashboard.sharedData.avg', { defaultValue: 'avg' })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users
                className="w-3 h-3 text-brand-blue-primary"
                aria-hidden="true"
              />
              {card.teacherCount}{' '}
              {card.teacherCount === 1
                ? t('plcDashboard.sharedData.teacher', {
                    defaultValue: 'teacher',
                  })
                : t('plcDashboard.sharedData.teachers', {
                    defaultValue: 'teachers',
                  })}
            </span>
            <span>
              {card.studentCount}{' '}
              {t('plcDashboard.sharedData.students', {
                defaultValue: 'students',
              })}
            </span>
            {card.expectedCount > 0 && (
              <span className="text-slate-500">
                {t('plcDashboard.sharedData.ranOf', {
                  defaultValue: '{{ran}} of {{total}} ran it',
                  ran: card.ranCount,
                  total: card.expectedCount,
                })}
              </span>
            )}
          </div>
        </div>

        {expanded ? (
          <ChevronDown
            className="w-4 h-4 text-slate-400 shrink-0"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="w-4 h-4 text-slate-400 shrink-0"
            aria-hidden="true"
          />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-5">
          {/* Designate affordance — promote this group to a common assessment */}
          {!card.isDesignated && canEdit && (
            <div className="flex items-center justify-between gap-3 bg-white border border-brand-blue-primary/20 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">
                  {t('plcDashboard.sharedData.designateTitle', {
                    defaultValue: 'Make this the team’s common assessment',
                  })}
                </p>
                <p className="text-xxs text-slate-500 mt-0.5">
                  {t('plcDashboard.sharedData.designateSubtitle', {
                    defaultValue:
                      'Designating gives it a shared title, unit, and status the whole team tracks.',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDesignate(card)}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                {t('plcDashboard.sharedData.designateAction', {
                  defaultValue: 'Designate',
                })}
              </button>
            </div>
          )}

          {/* Team average — the headline */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold ${scoreToneClass(
                card.teamAveragePercent
              )}`}
            >
              {card.teamAveragePercent}%
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {t('plcDashboard.sharedData.teamAverage', {
                defaultValue: 'team average',
              })}
            </span>
          </div>

          {/* Weakest questions — sorted ascending correctPercent */}
          {card.weakestQuestions.length > 0 && (
            <div>
              <h4 className="text-xxs font-bold uppercase tracking-wider text-slate-500 mb-2">
                {t('plcDashboard.sharedData.weakestQuestions', {
                  defaultValue: 'Weakest questions',
                })}
              </h4>
              <ul className="space-y-1.5">
                {card.weakestQuestions.map((q) => (
                  <li
                    key={q.questionId}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-700 truncate">
                        {q.text ||
                          t('plcDashboard.sharedData.untitledQuestion', {
                            defaultValue: 'Untitled question',
                          })}
                      </span>
                      <span
                        className={`text-xs font-bold shrink-0 ${scoreToneClass(
                          q.correctPercent
                        )}`}
                      >
                        {q.correctPercent}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barToneClass(
                          q.correctPercent
                        )}`}
                        style={{
                          width: `${Math.min(100, Math.max(0, q.correctPercent))}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-class compare — anonymized per-teacher rollup */}
          {card.perClass.length > 0 && (
            <div>
              <h4 className="text-xxs font-bold uppercase tracking-wider text-slate-500 mb-2">
                {t('plcDashboard.sharedData.byClass', {
                  defaultValue: 'By teacher / class',
                })}
              </h4>
              <ul className="space-y-1">
                {card.perClass.map((row) => (
                  <li
                    key={row.teacherUid}
                    className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-slate-700 truncate">
                      {row.teacherName}
                      {row.isYou && (
                        <span className="ml-1.5 text-xxs font-semibold text-brand-blue-primary">
                          {t('plcDashboard.sharedData.you', {
                            defaultValue: '(you)',
                          })}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="text-xxs text-slate-500">
                        {t('plcDashboard.sharedData.classCount', {
                          defaultValue: '{{count}} cls',
                          count: row.classCount,
                        })}
                      </span>
                      <span className="text-xxs text-slate-500">
                        {row.studentCount}{' '}
                        {t('plcDashboard.sharedData.studentsShort', {
                          defaultValue: 'stu',
                        })}
                      </span>
                      <span
                        className={`text-xs font-bold ${scoreToneClass(
                          row.averagePercent
                        )}`}
                      >
                        {row.averagePercent}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Who has run it — cross-reference against the roster */}
          {card.whoRan.length > 0 && (
            <div>
              <h4 className="text-xxs font-bold uppercase tracking-wider text-slate-500 mb-2">
                {t('plcDashboard.sharedData.whoRanIt', {
                  defaultValue: 'Who has run it',
                })}
              </h4>
              <ul className="flex flex-wrap gap-1.5">
                {card.whoRan.map((w) => (
                  <li
                    key={w.teacherUid}
                    className={`inline-flex items-center gap-1.5 text-xxs font-medium px-2 py-1 rounded-full border ${
                      w.hasRun
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-100 border-slate-200 text-slate-500'
                    }`}
                  >
                    {w.hasRun ? (
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <Circle className="w-3 h-3" aria-hidden="true" />
                    )}
                    <span>{w.teacherName}</span>
                    <span className="sr-only">
                      {w.hasRun
                        ? t('plcDashboard.sharedData.hasRun', {
                            defaultValue: 'has run it',
                          })
                        : t('plcDashboard.sharedData.notRun', {
                            defaultValue: 'has not run it yet',
                          })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Scoped comments + @mentions (Decision 2.6, §6.2). Keyed to the
              canonical assessment id so the thread survives re-aggregation and
              forward-aligns with the Common Assessment object. */}
          <div className="border-t border-slate-200 pt-4">
            <PlcCommentsThread
              plcId={plcId}
              targetType="dataCard"
              targetId={`assessment:${card.assessmentId}`}
              targetLabel={title}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PlcSharedDataBody
// ---------------------------------------------------------------------------

interface PlcSharedDataBodyProps {
  plc: Plc;
}

export const PlcSharedDataBody: React.FC<PlcSharedDataBodyProps> = ({
  plc,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const { showPrompt } = useDialog();
  const { designateAssessment } = usePlcActions();

  const {
    data: aggregates,
    loading: aggregatesLoading,
    error: aggregatesError,
  } = usePlcAggregatesData();
  const {
    data: assessments,
    loading: assessmentsLoading,
    error: assessmentsError,
  } = usePlcAssessmentsData();
  const members = usePlcMembers();

  // The signed-in member's OWN contribution read — used ONLY to drive the
  // per-card "updating…" state (and keeps the owner's own named roster reachable
  // to them). No member-facing read of another teacher's raw contributions.
  const { contributions: ownContributions } = usePlcContributions(plc.id);

  const [filters, setFilters] =
    useState<SharedDataAggregateFilters>(DEFAULT_FILTERS);

  const canEdit = useMemo(
    () => (user ? canEditPlcContent(plc, user.uid) : false),
    [plc, user]
  );

  const teamMembers = useMemo<SharedDataTeamMember[]>(
    () => members.map((m) => ({ uid: m.uid, displayName: m.displayName })),
    [members]
  );

  const latestContribByAggId = useMemo(
    () => latestContributionByAggregateId(ownContributions, assessments),
    [ownContributions, assessments]
  );

  const cards = useMemo(
    () =>
      buildAssessmentCards(
        aggregates,
        assessments,
        teamMembers,
        user?.uid ?? null,
        latestContribByAggId
      ),
    [aggregates, assessments, teamMembers, user?.uid, latestContribByAggId]
  );

  const teachers = useMemo(
    () => collectAggregateTeachers(aggregates),
    [aggregates]
  );
  const unitLabels = useMemo(
    () => collectUnitLabels(assessments),
    [assessments]
  );
  const hasDesignated = useMemo(
    () => assessments.some((a) => a.deletedAt == null),
    [assessments]
  );

  const filteredCards = useMemo(
    () => filterAssessmentCards(cards, filters),
    [cards, filters]
  );

  const handleDesignate = useCallback(
    async (card: AssessmentDataCard) => {
      const title = await showPrompt(
        t('plcDashboard.sharedData.designatePrompt', {
          defaultValue:
            'Name this common assessment so the whole team recognizes it.',
        }),
        {
          title: t('plcDashboard.sharedData.designatePromptTitle', {
            defaultValue: 'Designate common assessment',
          }),
          placeholder: t('plcDashboard.sharedData.designatePlaceholder', {
            defaultValue: 'e.g. Unit 4 CFA',
          }),
          defaultValue: card.title,
          confirmLabel: t('plcDashboard.sharedData.designateAction', {
            defaultValue: 'Designate',
          }),
        }
      );
      if (title == null) return; // cancelled
      const trimmed = title.trim();
      if (trimmed.length === 0) return;
      try {
        await designateAssessment({
          title: trimmed,
          kind: card.kind,
          syncGroupId: card.syncGroupId,
        });
        addToast(
          t('plcDashboard.sharedData.designated', {
            defaultValue: '“{{title}}” is now the team’s common assessment.',
            title: trimmed,
          }),
          'success'
        );
      } catch (err) {
        logError('PlcSharedDataBody.designateAssessment', err, {
          plcId: plc.id,
          assessmentId: card.assessmentId,
        });
        addToast(
          t('plcDashboard.sharedData.designateFailed', {
            defaultValue: 'Couldn’t designate that assessment. Try again.',
          }),
          'error'
        );
      }
    },
    [showPrompt, designateAssessment, addToast, plc.id, t]
  );

  // Loading state
  if (aggregatesLoading || assessmentsLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">
          {t('plcDashboard.sharedData.loading', {
            defaultValue: 'Loading shared data…',
          })}
        </span>
      </div>
    );
  }

  // Error state
  if (aggregatesError || assessmentsError) {
    const err = aggregatesError ?? assessmentsError;
    const errorMsg =
      err instanceof Error
        ? err.message
        : t('plcDashboard.sharedData.loadError', {
            defaultValue: "Couldn't load shared data",
          });
    return (
      <div className="bg-white border border-brand-red-primary/20 rounded-2xl p-4 flex items-start gap-3">
        <AlertCircle
          className="w-5 h-5 text-brand-red-primary shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div>
          <p className="text-xs font-bold text-slate-800">
            {t('plcDashboard.sharedData.loadError', {
              defaultValue: "Couldn't load shared data",
            })}
          </p>
          <p className="text-xxs text-slate-500 mt-0.5">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // Empty state — no aggregates at all (nothing has been run + rolled up yet).
  if (aggregates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-xs text-slate-500 py-12 px-4">
        <BarChart3 className="w-8 h-8 text-slate-300 mb-3" aria-hidden="true" />
        <p className="font-semibold text-slate-600">
          {t('plcDashboard.sharedData.emptyTitle', {
            defaultValue: 'No shared data yet',
          })}
        </p>
        <p className="text-xxs text-slate-500 mt-1 max-w-xs">
          {t('plcDashboard.sharedData.emptySubtitle', {
            defaultValue:
              'When members run a common assessment with PLC mode, anonymized results appear here.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      {/* Filter bar — now operates over aggregates */}
      <PlcSharedDataFilters
        filters={filters}
        onChange={setFilters}
        teachers={teachers}
        unitLabels={unitLabels}
        hasDesignated={hasDesignated}
      />

      {/* Results — one card per anonymized aggregate */}
      {filteredCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center text-xs text-slate-500 py-10 px-4">
          <BarChart3
            className="w-6 h-6 text-slate-300 mb-2"
            aria-hidden="true"
          />
          <p className="font-semibold text-slate-600">
            {t('plcDashboard.sharedData.noResults', {
              defaultValue: 'No results match your filters',
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCards.map((card) => (
            <ResultCard
              key={card.assessmentId}
              card={card}
              plcId={plc.id}
              canEdit={canEdit}
              onDesignate={handleDesignate}
            />
          ))}
        </div>
      )}
    </div>
  );
};
