// Newer-data check for a pinned hero (T6): a later common assessment has results.

import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  TeamHeroRef,
} from '@/types';
import { dateAggregates } from '@/utils/plcDataOverview';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';
import { saveTeamLayout } from '@/hooks/useTeamLayout';

export interface NewerHeroData {
  assessmentId: string;
  title: string;
  date: number;
}

export function selectNewerHeroData(
  heroRef: TeamHeroRef | null,
  aggregates: readonly PlcAssessmentAggregate[],
  assessments: readonly PlcCommonAssessment[]
): NewerHeroData | null {
  if (heroRef?.kind !== 'assessment') return null;
  const dated = dateAggregates(aggregates, assessments);
  const latest = dated[dated.length - 1];
  if (!latest || latest.aggregate.assessmentId === heroRef.assessmentId) {
    return null;
  }
  const pinned = dated.find(
    (d) => d.aggregate.assessmentId === heroRef.assessmentId
  );
  if (pinned && pinned.date >= latest.date) return null;
  const own = latest.assessment?.title.trim() ?? '';
  return {
    assessmentId: latest.aggregate.assessmentId,
    title: own.length > 0 ? own : (latest.aggregate.title ?? ''),
    date: latest.date,
  };
}

const DISMISS_KEY = (plcId: string) => `teams.heroNudgeDismissed.${plcId}`;

/** "Keep pinned" is remembered per viewer until even newer data arrives. */
export function readNudgeDismissed(plcId: string): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY(plcId));
  } catch {
    return null;
  }
}

export function writeNudgeDismissed(plcId: string, assessmentId: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY(plcId), assessmentId);
  } catch {
    // Storage blocked: the nudge just comes back next visit.
  }
}

/** "Show latest" follows the default rule when it is the latest assessment, else pins the newer one. */
export async function showLatestHero(
  plcId: string,
  layout: ResolvedTeamLayout,
  newer: NewerHeroData
): Promise<void> {
  await saveTeamLayout(plcId, {
    ...layout,
    hero:
      layout.heroRule === 'latestAssessment'
        ? { mode: 'default' }
        : {
            mode: 'pinned',
            ref: { kind: 'assessment', assessmentId: newer.assessmentId },
          },
  });
}
