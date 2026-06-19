/**
 * CommonAssessmentBanner — the Home hero strip (PRD §6.3, Decision 4.1).
 *
 * Surfaces the team's CURRENT common assessment with a glanceable status line
 * ("Unit 4 CFA — 3 of 4 ran it · Ready to review") and a Start / Resume Meeting
 * CTA that navigates to Meeting Mode (`/plc/:id/meeting`). When an in-progress
 * meeting already exists the CTA reads "Resume Meeting" (Meeting Mode handles the
 * live flow; navigation target is identical).
 *
 * Data sources (provider selectors — the assessments + aggregates listeners are
 * gated to the `home` section, so they're already live here):
 *   usePlcAssessmentsData → live common assessments
 *   usePlcAggregatesData  → anonymized rollups (who-ran-it count, no PII)
 *   usePlcMembers         → team size (the "of N" denominator)
 *   usePlcMeetings        → in-progress meeting to resume (standalone hook —
 *                           the meetings listener is NOT gated to home)
 *
 * FERPA-safe: the progress count is derived from `aggregate.perTeacher`
 * (teacher rollups only), never from raw contributions / student rows.
 *
 * Light-surface modal chrome (Home page) — normal Tailwind sizing, no cqmin.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Presentation,
  Sparkles,
} from 'lucide-react';

import type { Plc } from '@/types';
import {
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMembers,
} from '@/context/usePlcContext';
import { usePlcMeetings } from '@/hooks/usePlcMeetings';
import type { PlcSectionId } from '@/components/plc/sections';
import {
  buildCommonAssessmentBanner,
  type CommonAssessmentBannerPhase,
} from './commonAssessmentBannerSelectors';

interface CommonAssessmentBannerProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

/** Per-phase visual treatment (icon + accent classes), all on the light Home
 *  surface. Accent colors are purposeful state signals, not decoration. */
const PHASE_STYLES: Record<
  CommonAssessmentBannerPhase,
  { wrap: string; iconWrap: string; icon: string }
> = {
  planning: {
    wrap: 'from-slate-50 to-white border-slate-200/80',
    iconWrap: 'bg-slate-100',
    icon: 'text-slate-500',
  },
  running: {
    wrap: 'from-brand-blue-lighter/60 to-white border-brand-blue-light/40',
    iconWrap: 'bg-brand-blue-lighter',
    icon: 'text-brand-blue-primary',
  },
  ready: {
    wrap: 'from-emerald-50 to-white border-emerald-200/80',
    iconWrap: 'bg-emerald-100',
    icon: 'text-emerald-700',
  },
  reviewing: {
    wrap: 'from-violet-50 to-white border-violet-200/80',
    iconWrap: 'bg-violet-100',
    icon: 'text-violet-700',
  },
  closed: {
    wrap: 'from-slate-50 to-white border-slate-200/80',
    iconWrap: 'bg-slate-100',
    icon: 'text-slate-500',
  },
};

export const CommonAssessmentBanner: React.FC<CommonAssessmentBannerProps> = ({
  plc,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const { data: assessments, loading: assessmentsLoading } =
    usePlcAssessmentsData();
  const { data: aggregates } = usePlcAggregatesData();
  const members = usePlcMembers();
  const { meetings } = usePlcMeetings(plc.id);

  const aggregatesById = useMemo(() => {
    const map = new Map<string, (typeof aggregates)[number]>();
    for (const agg of aggregates) map.set(agg.assessmentId, agg);
    return map;
  }, [aggregates]);

  const model = useMemo(
    () =>
      buildCommonAssessmentBanner({
        assessments,
        aggregatesById,
        meetings,
        memberCount: members.length,
      }),
    [assessments, aggregatesById, meetings, members.length]
  );

  // Quiet skeleton while the first assessment snapshot settles, so the banner
  // doesn't flash the "no common assessment" empty state then pop in.
  if (assessmentsLoading && assessments.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-4 shadow-sm"
        aria-busy="true"
      >
        <Loader2
          className="w-5 h-5 text-slate-300 animate-spin"
          aria-hidden="true"
        />
        <span className="text-sm text-slate-400">
          {t('plcDashboard.home.commonAssessment.loading', {
            defaultValue: 'Loading your common assessment…',
          })}
        </span>
      </div>
    );
  }

  // No common assessment designated yet — a calm prompt that points teachers to
  // Shared Data (where undesignated result groups can be promoted) and Meeting
  // Mode (which can designate + review in one flow).
  if (!model) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <ClipboardCheck
              className="w-5 h-5 text-slate-500"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">
              {t('plcDashboard.home.commonAssessment.emptyTitle', {
                defaultValue: 'No common assessment yet',
              })}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('plcDashboard.home.commonAssessment.emptySubtitle', {
                defaultValue:
                  'Designate one in Shared Data, then review the pooled results together.',
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('sharedData')}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50"
        >
          {t('plcDashboard.home.commonAssessment.reviewData', {
            defaultValue: 'Review shared data',
          })}
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const { assessment, ranCount, expectedCount, phase, inProgressMeeting } =
    model;
  const styles = PHASE_STYLES[phase];

  // Phase → human-readable status tail ("Ready to review", "1 of 4 ran it"…).
  const phaseLabel = ((): string => {
    switch (phase) {
      case 'planning':
        return t('plcDashboard.home.commonAssessment.phase.planning', {
          defaultValue: 'Planning — not run yet',
        });
      case 'running':
        return t('plcDashboard.home.commonAssessment.phase.running', {
          defaultValue: 'In progress',
        });
      case 'ready':
        return t('plcDashboard.home.commonAssessment.phase.ready', {
          defaultValue: 'Ready to review',
        });
      case 'reviewing':
        return t('plcDashboard.home.commonAssessment.phase.reviewing', {
          defaultValue: 'Reviewing together',
        });
      case 'closed':
        return t('plcDashboard.home.commonAssessment.phase.closed', {
          defaultValue: 'Closed',
        });
    }
  })();

  // "3 of 4 ran it" — only meaningful once at least the denominator is known.
  const progressLabel = t('plcDashboard.home.commonAssessment.ranIt', {
    ran: ranCount,
    total: expectedCount,
    defaultValue: '{{ran}} of {{total}} ran it',
  });

  const Icon = phase === 'ready' ? CheckCircle2 : ClipboardCheck;

  // CTA: resume an in-progress meeting, else start a new one. Navigation target
  // is identical (Meeting Mode owns the live flow); only the copy differs.
  const ctaLabel = inProgressMeeting
    ? t('plcDashboard.home.commonAssessment.resumeMeeting', {
        defaultValue: 'Resume Meeting',
      })
    : t('plcDashboard.home.commonAssessment.startMeeting', {
        defaultValue: 'Start Meeting',
      });

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border bg-gradient-to-br px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${styles.wrap}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
        >
          <Icon className={`w-5 h-5 ${styles.icon}`} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-base font-bold text-slate-900 truncate">
              {assessment.title}
            </p>
            {assessment.unitLabel && assessment.unitLabel.length > 0 && (
              <span className="hidden sm:inline-flex shrink-0 items-center rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 ring-1 ring-slate-200">
                {assessment.unitLabel}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {/* "3 of 4 ran it · Ready to review" */}
            <span className="font-semibold text-slate-700">
              {progressLabel}
            </span>
            <span className="mx-1.5 text-slate-300" aria-hidden="true">
              ·
            </span>
            <span>{phaseLabel}</span>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNavigate('meeting')}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-blue-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
      >
        {inProgressMeeting ? (
          <Presentation className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Sparkles className="w-4 h-4" aria-hidden="true" />
        )}
        <span>{ctaLabel}</span>
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};
