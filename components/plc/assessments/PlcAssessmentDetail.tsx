/**
 * PlcAssessmentDetail — the pooled results view for one assessment
 * (plan D3/D8): team average, students counted, teachers contributing,
 * per-question % incorrect worst-first with a choice-distribution panel, and
 * a per-teacher table only when the PLC's `showPerTeacher` setting is on.
 * Reads the server-written aggregate only; no student names exist in it.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Loader2,
  Users,
  Video,
} from 'lucide-react';
import {
  getPlcFeatures,
  type Plc,
  type PlcAggregateTargetRow,
  type PlcAssessmentAggregate,
} from '@/types';
import {
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMembers,
} from '@/context/usePlcContext';
import { buildPlcPath, spaNavigate } from '@/utils/plcPath';
import { PlcCommentsThread } from '@/components/plc/comments/PlcCommentsThread';
import { TargetChips } from '@/components/quiz/targets/TargetChips';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { DEFAULT_MASTERY_CUTOFFS } from '@/utils/learningTargets';
import { masteryBandFor, type MasteryBand } from '@/utils/quizTargetStats';
import {
  aggregateStatus,
  firstNonEmpty,
  formatShortDate,
  hasTeamAverage,
  sortWorstFirst,
  teacherPoolSize,
} from './assessmentListSelectors';
import { AssessmentStatusBadge } from './PlcAssessmentList';

interface PlcAssessmentDetailProps {
  plc: Plc;
  assessmentId: string;
}

type PerQuestion = PlcAssessmentAggregate['perQuestion'][number];

const MASTERY_BAR_CLASS: Record<MasteryBand, string> = {
  proficient: 'bg-emerald-500',
  approaching: 'bg-amber-400',
  beginning: 'bg-brand-red-light',
};

/** Tone by % incorrect: low error emerald, moderate amber, high red. */
function incorrectToneClass(incorrectPercent: number): string {
  if (incorrectPercent <= 20) return 'text-emerald-600';
  if (incorrectPercent <= 40) return 'text-amber-600';
  return 'text-brand-red-primary';
}

function incorrectBarClass(incorrectPercent: number): string {
  if (incorrectPercent <= 20) return 'bg-emerald-500';
  if (incorrectPercent <= 40) return 'bg-amber-500';
  return 'bg-brand-red-primary';
}

function scoreToneClass(percent: number): string {
  if (percent >= 80) return 'text-emerald-600';
  if (percent >= 60) return 'text-amber-600';
  return 'text-brand-red-primary';
}

const QuestionRow: React.FC<{ question: PerQuestion; index: number }> = ({
  question,
  index,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const scored = typeof question.incorrectPercent === 'number';
  const incorrect = question.incorrectPercent ?? 0;
  const distribution = question.choiceDistribution ?? [];
  const canExpand = distribution.length > 0;
  const answered = question.answered ?? 0;

  return (
    <li
      data-testid="question-row"
      className="bg-white border border-slate-200 rounded-xl"
    >
      <button
        type="button"
        onClick={canExpand ? () => setOpen((v) => !v) : undefined}
        aria-expanded={canExpand ? open : undefined}
        className={`w-full text-left px-4 py-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${canExpand ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-slate-800 truncate">
            <span className="text-slate-400 mr-2">{index + 1}.</span>
            {question.text ||
              t('plcDashboard.assessmentDetail.untitledQuestion', {
                defaultValue: 'Untitled question',
              })}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {scored ? (
              <span
                className={`text-sm font-bold ${incorrectToneClass(incorrect)}`}
              >
                {t('plcDashboard.assessmentDetail.incorrectPercent', {
                  defaultValue: '{{percent}}% incorrect',
                  percent: incorrect,
                })}
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-500">
                {t('plcDashboard.assessmentDetail.notScored', {
                  defaultValue: 'Not scored',
                })}
              </span>
            )}
            {canExpand && (
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            )}
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${scored ? incorrectBarClass(incorrect) : 'bg-slate-300'}`}
            style={{
              width: `${scored ? Math.min(100, Math.max(0, incorrect)) : 0}%`,
            }}
          />
        </div>
        <div className="mt-1.5 text-xs text-slate-500">
          {t('plcDashboard.assessmentDetail.gradedOfAnswered', {
            defaultValue:
              '{{served}} served · {{graded}} graded · {{answered}} answered',
            served: question.servedCount ?? answered,
            graded: question.graded ?? 0,
            answered,
          })}
        </div>
      </button>

      {open && canExpand && (
        <div
          data-testid="choice-distribution"
          className="border-t border-slate-100 px-4 py-3"
        >
          <h4 className="text-xxs font-bold uppercase tracking-wider text-slate-500 mb-2">
            {t('plcDashboard.assessmentDetail.choiceDistribution', {
              defaultValue: 'Answer distribution',
            })}
          </h4>
          <ul className="space-y-1.5">
            {distribution.map((choice) => {
              const pct =
                answered > 0 ? Math.round((choice.count / answered) * 100) : 0;
              return (
                <li
                  key={choice.label}
                  className={`flex items-center gap-3 px-3 py-1.5 rounded-lg ${
                    choice.isCorrect
                      ? 'bg-emerald-50 border border-emerald-200'
                      : 'bg-slate-50'
                  }`}
                >
                  <span
                    className={`flex-1 min-w-0 text-sm truncate ${choice.isCorrect ? 'font-bold text-emerald-800' : 'text-slate-700'}`}
                  >
                    {choice.label}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0">
                    {t('plcDashboard.assessmentDetail.choiceCount', {
                      defaultValue: '{{count}} · {{percent}}%',
                      count: choice.count,
                      percent: pct,
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
};

const TargetAggregateRow: React.FC<{
  row: PlcAggregateTargetRow;
  questionsById: Map<string, PerQuestion>;
  cutoffs: { proficient: number; approaching: number };
}> = ({ row, questionsById, cutoffs }) => {
  const [open, setOpen] = useState(false);
  const questions = row.questionIds
    .map((id) => questionsById.get(id))
    .filter((question): question is PerQuestion => question !== undefined);
  const band = masteryBandFor(row.correctPercent, cutoffs) ?? 'beginning';
  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${row.code ?? row.label}`}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <span className="min-w-0 flex-1">
          <TargetChips
            targets={[
              {
                id: row.targetId,
                kind: row.kind,
                ...(row.code ? { code: row.code } : {}),
                label: row.label,
              },
            ]}
            compact
          />
          <span className="mt-1 block text-xxs text-slate-500">
            {row.attempted} scored · {row.questionIds.length} question
            {row.questionIds.length === 1 ? '' : 's'}
          </span>
        </span>
        {row.lowSample && (
          <span
            title="Fewer than 5 scored student-question pairs"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-xxs font-bold text-amber-800"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Low sample
          </span>
        )}
        <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">
          {row.correctPercent}%
        </span>
        <span className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100">
          <span
            className={`block h-full rounded-full ${MASTERY_BAR_CLASS[band]}`}
            style={{
              width: `${Math.min(100, Math.max(0, row.correctPercent))}%`,
            }}
          />
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/70">
          {questions.map((question) => (
            <li
              key={question.questionId}
              className="flex items-center gap-3 px-4 py-2 pl-10 text-xs text-slate-600"
            >
              <span className="min-w-0 flex-1 truncate">
                {question.text || 'Untitled question'}
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {question.servedCount ?? question.answered ?? 0} served
              </span>
              <span className="w-10 shrink-0 text-right font-bold tabular-nums text-slate-700">
                {question.graded ? `${question.correctPercent}%` : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export const PlcAssessmentDetail: React.FC<PlcAssessmentDetailProps> = ({
  plc,
  assessmentId,
}) => {
  const { t, i18n } = useTranslation();
  const { data: assessments, loading: assessmentsLoading } =
    usePlcAssessmentsData();
  const { data: aggregates, loading: aggregatesLoading } =
    usePlcAggregatesData();
  const members = usePlcMembers();
  const memberUids = useMemo(
    () => new Set(members.map((m) => m.uid)),
    [members]
  );
  const { list: learningTargetList } = usePlcLearningTargets(plc.id);
  const showPerTeacher = getPlcFeatures(plc).showPerTeacher;

  const assessment = useMemo(
    () =>
      assessments.find((a) => a.id === assessmentId && a.deletedAt == null) ??
      null,
    [assessments, assessmentId]
  );
  const aggregate = useMemo(
    () => aggregates.find((a) => a.assessmentId === assessmentId) ?? null,
    [aggregates, assessmentId]
  );
  const questions = useMemo(
    () => sortWorstFirst(aggregate?.perQuestion ?? []),
    [aggregate]
  );
  const questionsById = useMemo(
    () =>
      new Map(
        (aggregate?.perQuestion ?? []).map((question) => [
          question.questionId,
          question,
        ])
      ),
    [aggregate]
  );
  const standards = aggregate?.perStandard ?? [];
  const targets = (aggregate?.perTarget ?? []).filter(
    (row) => row.kind !== 'standard'
  );
  const masteryCutoffs =
    learningTargetList?.masteryCutoffs ?? DEFAULT_MASTERY_CUTOFFS;

  const goBack = () => spaNavigate(buildPlcPath(plc.id, 'assessments'));
  const backButton = (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
    >
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      {t('plcDashboard.assessmentDetail.back', {
        defaultValue: 'All assessments',
      })}
    </button>
  );

  if (!assessment && !aggregate) {
    if (assessmentsLoading || aggregatesLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        {backButton}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <ClipboardList
            className="w-10 h-10 text-slate-300 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-base font-bold text-slate-700">
            {t('plcDashboard.assessmentDetail.notFoundTitle', {
              defaultValue: 'Assessment not found',
            })}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {t('plcDashboard.assessmentDetail.notFoundSubtitle', {
              defaultValue: 'It may have been removed from this PLC.',
            })}
          </p>
        </div>
      </div>
    );
  }

  const title =
    firstNonEmpty([assessment?.title, aggregate?.title]) ??
    t('plcDashboard.assessmentDetail.untitled', {
      defaultValue: 'Untitled assessment',
    });
  const kind = assessment?.kind ?? aggregate?.kind ?? 'quiz';
  const KindIcon = kind === 'video-activity' ? Video : BookOpen;
  const status = aggregateStatus(aggregate);
  const scored = hasTeamAverage(aggregate);
  const teacherCount = aggregate?.teacherCount ?? 0;
  const studentCount = aggregate?.studentCount ?? 0;
  const ranAt = aggregate && aggregate.ranAt > 0 ? aggregate.ranAt : null;

  return (
    <div className="flex flex-col gap-5">
      {backButton}

      {/* Header */}
      <header className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-brand-blue-primary/10 shrink-0">
            <KindIcon
              className="w-5 h-5 text-brand-blue-primary"
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-extrabold text-slate-800 truncate">
                {title}
              </h2>
              <AssessmentStatusBadge status={status} />
            </div>
            {assessment?.unitLabel && (
              <p className="text-xs text-slate-500 mt-0.5">
                {assessment.unitLabel}
              </p>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl px-3 py-2.5">
            <dt className="text-xxs font-bold uppercase tracking-wider text-slate-500">
              {t('plcDashboard.assessmentDetail.teamAverage', {
                defaultValue: 'Team average',
              })}
            </dt>
            <dd
              data-testid="team-average"
              className={`text-2xl font-extrabold mt-0.5 ${scored ? scoreToneClass(aggregate?.teamAveragePercent ?? 0) : 'text-slate-500 text-base'}`}
            >
              {scored
                ? `${aggregate?.teamAveragePercent ?? 0}%`
                : t('plcDashboard.assessmentDetail.notScoredYet', {
                    defaultValue: 'Not scored yet',
                  })}
            </dd>
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2.5">
            <dt className="text-xxs font-bold uppercase tracking-wider text-slate-500">
              {t('plcDashboard.assessmentDetail.students', {
                defaultValue: 'Students counted',
              })}
            </dt>
            <dd className="text-2xl font-extrabold text-slate-800 mt-0.5">
              {studentCount}
            </dd>
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2.5">
            <dt className="text-xxs font-bold uppercase tracking-wider text-slate-500">
              {t('plcDashboard.assessmentDetail.teachers', {
                defaultValue: 'Teachers',
              })}
            </dt>
            <dd className="text-2xl font-extrabold text-slate-800 mt-0.5">
              {t('plcDashboard.assessmentDetail.teachersOf', {
                defaultValue: '{{count}} of {{total}}',
                count: teacherCount,
                total: teacherPoolSize([...memberUids], aggregate),
              })}
            </dd>
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2.5">
            <dt className="text-xxs font-bold uppercase tracking-wider text-slate-500">
              {t('plcDashboard.assessmentDetail.lastComputed', {
                defaultValue: 'Last updated',
              })}
            </dt>
            <dd className="text-base font-bold text-slate-800 mt-1">
              {ranAt
                ? formatShortDate(ranAt, i18n.language)
                : t('plcDashboard.assessmentDetail.neverComputed', {
                    defaultValue: 'Not yet',
                  })}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-slate-500 mt-3">
          {t('plcDashboard.assessmentDetail.studentsHint', {
            defaultValue:
              'Students are counted per teacher; a student in two teachers’ classes counts twice.',
          })}
        </p>

        {aggregate?.alignmentWarning && (
          <div
            role="note"
            className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs"
          >
            <AlertTriangle
              className="w-4 h-4 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span>{aggregate.alignmentWarning}</span>
          </div>
        )}
      </header>

      {(standards.length > 0 || targets.length > 0) && (
        <section data-testid="target-mastery">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            {t('plcDashboard.assessmentDetail.targetMasteryHeading', {
              defaultValue: 'Learning target mastery',
            })}
          </h3>
          {standards.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-2 text-xxs font-bold uppercase tracking-wider text-slate-500">
                {t('plcDashboard.assessmentDetail.standardsHeading', {
                  defaultValue: 'Standards',
                })}
              </h4>
              <ul className="space-y-2">
                {standards.map((row) => (
                  <TargetAggregateRow
                    key={row.targetId}
                    row={row}
                    questionsById={questionsById}
                    cutoffs={masteryCutoffs}
                  />
                ))}
              </ul>
            </div>
          )}
          {targets.length > 0 && (
            <div>
              <h4 className="mb-2 text-xxs font-bold uppercase tracking-wider text-slate-500">
                {t('plcDashboard.assessmentDetail.targetsHeading', {
                  defaultValue: 'Targets',
                })}
              </h4>
              <ul className="space-y-2">
                {targets.map((row) => (
                  <TargetAggregateRow
                    key={row.targetId}
                    row={row}
                    questionsById={questionsById}
                    cutoffs={masteryCutoffs}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Per-question error frequency */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
          {t('plcDashboard.assessmentDetail.questionsHeading', {
            defaultValue: 'Questions, most missed first',
          })}
        </h3>
        {questions.length === 0 ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-6 text-center">
            {t('plcDashboard.assessmentDetail.noQuestions', {
              defaultValue:
                'No results yet. Once a teacher runs this assessment and publishes scores, the pooled questions appear here.',
            })}
          </p>
        ) : (
          <ul className="space-y-2">
            {questions.map((q, i) => (
              <QuestionRow key={q.questionId} question={q} index={i} />
            ))}
          </ul>
        )}
      </section>

      {/* Per-teacher table (gated by the PLC setting) */}
      {showPerTeacher && aggregate && aggregate.perTeacher.length > 0 && (
        <section data-testid="per-teacher-table">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            {t('plcDashboard.assessmentDetail.perTeacherHeading', {
              defaultValue: 'By teacher',
            })}
          </h3>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xxs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="px-4 py-2.5">
                    {t('plcDashboard.assessmentDetail.teacher', {
                      defaultValue: 'Teacher',
                    })}
                  </th>
                  <th className="px-4 py-2.5">
                    {t('plcDashboard.assessmentDetail.classes', {
                      defaultValue: 'Classes',
                    })}
                  </th>
                  <th className="px-4 py-2.5">
                    {t('plcDashboard.assessmentDetail.studentsColumn', {
                      defaultValue: 'Students',
                    })}
                  </th>
                  <th className="px-4 py-2.5">
                    {t('plcDashboard.assessmentDetail.average', {
                      defaultValue: 'Average',
                    })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {aggregate.perTeacher.map((row) => (
                  <tr
                    key={row.teacherUid}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                      <span className="inline-flex items-center gap-2">
                        <Users
                          className="w-3.5 h-3.5 text-slate-400"
                          aria-hidden="true"
                        />
                        {row.teacherName ||
                          (memberUids.has(row.teacherUid)
                            ? t(
                                'plcDashboard.assessmentDetail.unknownTeacher',
                                {
                                  defaultValue: 'Teacher',
                                }
                              )
                            : t(
                                'plcDashboard.assessmentDetail.nonMemberTeacher',
                                {
                                  defaultValue: 'Not a PLC member',
                                }
                              ))}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {row.classCount}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {row.studentCount}
                    </td>
                    <td
                      className={`px-4 py-2.5 font-bold ${scoreToneClass(row.averagePercent)}`}
                    >
                      {row.averagePercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Scoped comments, keyed to the canonical assessment id. */}
      <div className="border-t border-slate-200 pt-4">
        <PlcCommentsThread
          plcId={plc.id}
          targetType="dataCard"
          targetId={`assessment:${assessmentId}`}
          targetLabel={title}
        />
      </div>
    </div>
  );
};
