/**
 * PlcMeetingReviewCard — one assessment's anonymized pooled data, rendered
 * LARGE for the Review step of Meeting Mode (PRD §6.2 step 2). This is the hero
 * data surface: glanceable across a room, large type hierarchy, minimal chrome.
 *
 * The numbers come entirely from the FERPA-safe `PlcAssessmentAggregate` rollup
 * (team average, weakest questions, per-class compare, who-ran-it) — never from
 * raw contributions, so no student name ever reaches this surface. The card
 * reuses the same pure selectors Shared Data uses (`weakestQuestions`, the
 * per-class / who-ran derivations live in the `AssessmentDataCard` the parent
 * builds), so Review and Data never drift.
 *
 * Each card is COMMENTABLE via the shared `PlcCommentsThread`, keyed to the same
 * `assessment:<assessmentId>` target as Shared Data so a comment posted in one
 * surface shows in the other (Decision 2.6).
 *
 * Surface: PLC light surface (white card on slate-50). Muted text uses the
 * light-surface palette (`text-slate-500/600`) per the project's contrast
 * guidance — this is NOT a dark surface. Interactive controls carry focus rings;
 * the "Discuss a question" buttons drive the parent's Decide-step linking.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquarePlus,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import { PlcCommentsThread } from '@/components/plc/comments/PlcCommentsThread';
import type { AssessmentDataCard } from '../sharedData/sharedDataSelectors';

/** Calm, glanceable score tone — shared with the Shared Data palette. */
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

interface PlcMeetingReviewCardProps {
  card: AssessmentDataCard;
  plcId: string;
  /**
   * Invoked when the facilitator clicks "Discuss" on a weak question — opens the
   * Decide step pre-linked to this assessment + question. `questionId` is omitted
   * for the card-level "Discuss this assessment" action.
   */
  onDiscuss: (assessmentId: string, questionId?: string) => void;
}

export const PlcMeetingReviewCard: React.FC<PlcMeetingReviewCardProps> = ({
  card,
  plcId,
  onDiscuss,
}) => {
  const { t } = useTranslation();

  const title =
    card.title ||
    t('plcDashboard.meeting.untitledAssessment', {
      defaultValue: 'Untitled assessment',
    });
  const KindIcon = card.kind === 'video-activity' ? Video : BookOpen;

  return (
    <section
      data-testid="meeting-review-card"
      className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden"
      aria-label={t('plcDashboard.meeting.reviewCardLabel', {
        defaultValue: 'Pooled results for {{title}}',
        title,
      })}
    >
      {/* Header — assessment identity + headline team average */}
      <header className="px-6 lg:px-8 pt-6 pb-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-brand-blue-primary/10 shrink-0">
            <KindIcon
              className="w-6 h-6 text-brand-blue-primary"
              aria-hidden="true"
            />
          </span>
          <div className="min-w-0">
            <h3 className="text-xl lg:text-2xl font-extrabold text-slate-800 leading-tight">
              {title}
            </h3>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-600 flex-wrap">
              {card.assessment?.unitLabel && (
                <span className="font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                  {card.assessment.unitLabel}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Users
                  className="w-4 h-4 text-brand-blue-primary"
                  aria-hidden="true"
                />
                {t('plcDashboard.meeting.teacherStudentCount', {
                  defaultValue: '{{teachers}} teachers · {{students}} students',
                  teachers: card.teacherCount,
                  students: card.studentCount,
                })}
              </span>
              {card.updating && (
                <span
                  className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-semibold"
                  title={t('plcDashboard.meeting.updatingHint', {
                    defaultValue:
                      'New results are still rolling up — numbers refresh shortly.',
                  })}
                >
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  {t('plcDashboard.meeting.updating', {
                    defaultValue: 'updating…',
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* The HERO number — team average, sized for projection. */}
        <div className="flex flex-col items-end shrink-0">
          <span
            className={`text-5xl lg:text-6xl font-black tabular-nums leading-none ${scoreToneClass(
              card.teamAveragePercent
            )}`}
          >
            {card.teamAveragePercent}%
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-1">
            {t('plcDashboard.meeting.teamAverage', {
              defaultValue: 'Team average',
            })}
          </span>
        </div>
      </header>

      <div className="px-6 lg:px-8 py-6 grid gap-6 lg:grid-cols-2">
        {/* Weakest questions — the meeting's focus, large + sorted weakest-first */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600">
              {t('plcDashboard.meeting.weakestQuestions', {
                defaultValue: 'Weakest questions',
              })}
            </h4>
            <button
              type="button"
              onClick={() => onDiscuss(card.assessmentId)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue-primary hover:text-brand-blue-dark px-2.5 py-1.5 rounded-lg hover:bg-brand-blue-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              <MessageSquarePlus className="w-4 h-4" aria-hidden="true" />
              {t('plcDashboard.meeting.discussAssessment', {
                defaultValue: 'Discuss this',
              })}
            </button>
          </div>
          {card.weakestQuestions.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t('plcDashboard.meeting.noQuestions', {
                defaultValue: 'No question-level data available yet.',
              })}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {card.weakestQuestions.map((q) => (
                <li
                  key={q.questionId}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-base font-semibold text-slate-700 min-w-0 flex-1 truncate">
                      {q.text ||
                        t('plcDashboard.meeting.untitledQuestion', {
                          defaultValue: 'Untitled question',
                        })}
                    </span>
                    <span
                      className={`text-2xl font-extrabold tabular-nums shrink-0 ${scoreToneClass(
                        q.correctPercent
                      )}`}
                    >
                      {q.correctPercent}%
                    </span>
                    <button
                      type="button"
                      onClick={() => onDiscuss(card.assessmentId, q.questionId)}
                      className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl text-brand-blue-primary hover:bg-brand-blue-primary/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
                      aria-label={t('plcDashboard.meeting.discussQuestion', {
                        defaultValue: 'Discuss this question in a decision',
                      })}
                    >
                      <MessageSquarePlus
                        className="w-5 h-5"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
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
          )}
        </div>

        {/* Per-class compare — anonymized per-teacher rollup */}
        {card.perClass.length > 0 && (
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-3">
              {t('plcDashboard.meeting.byClass', {
                defaultValue: 'By teacher / class',
              })}
            </h4>
            <ul className="space-y-2">
              {card.perClass.map((row) => (
                <li
                  key={row.teacherUid}
                  className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5"
                >
                  <span className="text-base text-slate-700 truncate min-w-0">
                    {row.teacherName}
                    {row.isYou && (
                      <span className="ml-2 text-xs font-semibold text-brand-blue-primary">
                        {t('plcDashboard.meeting.you', {
                          defaultValue: '(you)',
                        })}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500">
                      {t('plcDashboard.meeting.classCount', {
                        defaultValue: '{{count}} cls',
                        count: row.classCount,
                      })}
                    </span>
                    <span
                      className={`text-lg font-bold tabular-nums ${scoreToneClass(
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

        {/* Who has run it — roster cross-reference */}
        {card.whoRan.length > 0 && (
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-600 mb-3">
              {t('plcDashboard.meeting.whoRanIt', {
                defaultValue: 'Who has run it',
              })}{' '}
              <span className="font-semibold text-slate-500 normal-case tracking-normal">
                {t('plcDashboard.meeting.ranOf', {
                  defaultValue: '({{ran}} of {{total}})',
                  ran: card.ranCount,
                  total: card.expectedCount,
                })}
              </span>
            </h4>
            <ul className="flex flex-wrap gap-2">
              {card.whoRan.map((w) => (
                <li
                  key={w.teacherUid}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border ${
                    w.hasRun
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                  }`}
                >
                  {w.hasRun ? (
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Circle className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{w.teacherName}</span>
                  <span className="sr-only">
                    {w.hasRun
                      ? t('plcDashboard.meeting.hasRun', {
                          defaultValue: 'has run it',
                        })
                      : t('plcDashboard.meeting.notRun', {
                          defaultValue: 'has not run it yet',
                        })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Honor-roll callout when there are no weak spots at all. */}
        {card.weakestQuestions.length > 0 &&
          card.weakestQuestions.every((q) => q.correctPercent >= 80) && (
            <div className="lg:col-span-2 flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <Trophy className="w-5 h-5 shrink-0" aria-hidden="true" />
              {t('plcDashboard.meeting.strongAcross', {
                defaultValue:
                  'Strong across the board — every question cleared 80%.',
              })}
            </div>
          )}
      </div>

      {/* Scoped comments — keyed identically to Shared Data so threads are one. */}
      <div className="border-t border-slate-100 bg-slate-50/60 px-6 lg:px-8 py-5">
        <PlcCommentsThread
          plcId={plcId}
          targetType="dataCard"
          targetId={`assessment:${card.assessmentId}`}
          targetLabel={title}
        />
      </div>
    </section>
  );
};
