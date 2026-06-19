/**
 * Pure selectors for the Home common-assessment status banner (PRD §6.3,
 * Decision 4.1).
 *
 * The banner surfaces the team's CURRENT common assessment — the one the team is
 * actively planning / running / reviewing — together with a "who's run it"
 * progress read derived from its anonymized aggregate, and a CTA that starts (or
 * resumes) the data meeting.
 *
 * All inputs are the already-parsed provider shapes (`PlcCommonAssessment`,
 * `PlcAssessmentAggregate`, `PlcMeeting`). Everything here is anonymized: the
 * progress count comes from `aggregate.perTeacher` (teacher rollups only — no
 * student names / per-student rows), so the banner is FERPA-safe.
 *
 * Kept separate from the component so the (non-trivial) selection + progress +
 * phase logic is unit-tested without rendering React.
 */

import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMeeting,
} from '@/types';

/**
 * The banner's derived "phase" — drives the headline tone and which CTA copy is
 * shown. Distinct from the raw `PlcCommonAssessment['status']` because the
 * banner also reasons about run-progress (e.g. an `active` assessment that
 * everyone has already run is "ready to review").
 */
export type CommonAssessmentBannerPhase =
  | 'planning' // designated, nobody has run it yet
  | 'running' // some (but not all expected) teachers have run it
  | 'ready' // everyone expected has run it — ready to review together
  | 'reviewing' // a meeting is in progress / status === 'reviewing'
  | 'closed'; // status === 'closed'

export interface CommonAssessmentBannerModel {
  /** The chosen common assessment to feature. */
  assessment: PlcCommonAssessment;
  /** Its anonymized aggregate, if the rollup exists yet (null = not run yet). */
  aggregate: PlcAssessmentAggregate | null;
  /** Distinct teachers who have contributed results (from `perTeacher`). */
  ranCount: number;
  /**
   * Teachers the assessment is expected across. We use the team size (member
   * count) when known, falling back to `ranCount` so progress never reads
   * "3 of 0". Callers pass the live member count.
   */
  expectedCount: number;
  /** Derived banner phase (headline tone + CTA copy). */
  phase: CommonAssessmentBannerPhase;
  /** An in-progress meeting to RESUME, if one exists; else null (start fresh). */
  inProgressMeeting: PlcMeeting | null;
}

/**
 * Pick the single common assessment to feature on Home from the live list.
 *
 * Selection priority (most-actionable first):
 *   1. `reviewing` — the team is mid-review; keep it front-and-center.
 *   2. `active`    — currently being run.
 *   3. `planning`  — designated but not yet live.
 *   4. `closed`    — most-recently closed (so a just-finished CFA still shows
 *                    a "review the recap" affordance for a beat).
 * Within a tier, the most-recently-updated assessment wins. Soft-deleted
 * assessments are ignored. Returns null when the team has no common assessment.
 */
export function pickFeaturedAssessment(
  assessments: readonly PlcCommonAssessment[]
): PlcCommonAssessment | null {
  const live = assessments.filter((a) => a.deletedAt == null);
  if (live.length === 0) return null;

  const rank: Record<PlcCommonAssessment['status'], number> = {
    reviewing: 0,
    active: 1,
    planning: 2,
    closed: 3,
  };

  return [...live].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      // Newest-updated first within a tier.
      b.updatedAt - a.updatedAt
  )[0];
}

/**
 * The newest in-progress meeting for the PLC, if any — the CTA resumes it
 * instead of starting a fresh one. Soft-deleted meetings are ignored.
 */
export function pickInProgressMeeting(
  meetings: readonly PlcMeeting[]
): PlcMeeting | null {
  const live = meetings.filter(
    (m) => m.deletedAt == null && m.status === 'in-progress'
  );
  if (live.length === 0) return null;
  return [...live].sort((a, b) => b.heldAt - a.heldAt)[0];
}

/**
 * Derive the banner phase from the assessment status, the run-progress, and
 * whether a meeting is already in progress.
 */
export function deriveBannerPhase(params: {
  status: PlcCommonAssessment['status'];
  ranCount: number;
  expectedCount: number;
  hasInProgressMeeting: boolean;
}): CommonAssessmentBannerPhase {
  const { status, ranCount, expectedCount, hasInProgressMeeting } = params;
  if (hasInProgressMeeting || status === 'reviewing') return 'reviewing';
  if (status === 'closed') return 'closed';
  // status is 'planning' or 'active' at this point.
  if (ranCount <= 0) return 'planning';
  if (expectedCount > 0 && ranCount >= expectedCount) return 'ready';
  return 'running';
}

/**
 * Assemble the full banner model from the provider slices. Returns null when
 * there is no common assessment to feature (the banner then renders a quiet
 * "designate one" empty state, handled by the component).
 *
 * @param assessments  live + soft-deleted common assessments (we filter).
 * @param aggregatesById  aggregate keyed by canonical assessment id.
 * @param meetings  live + soft-deleted meeting records (we filter).
 * @param memberCount  team size, used as `expectedCount` when > 0.
 */
export function buildCommonAssessmentBanner(params: {
  assessments: readonly PlcCommonAssessment[];
  aggregatesById: ReadonlyMap<string, PlcAssessmentAggregate>;
  meetings: readonly PlcMeeting[];
  memberCount: number;
}): CommonAssessmentBannerModel | null {
  const { assessments, aggregatesById, meetings, memberCount } = params;
  const assessment = pickFeaturedAssessment(assessments);
  if (!assessment) return null;

  const aggregate = aggregatesById.get(assessment.id) ?? null;
  const ranCount = aggregate ? aggregate.perTeacher.length : 0;
  // Prefer the live team size; fall back to ranCount so we never show
  // "3 of 0". `memberCount` of 0 (provider not hydrated) degrades gracefully.
  const expectedCount = memberCount > 0 ? memberCount : ranCount;

  const inProgressMeeting = pickInProgressMeeting(meetings);

  const phase = deriveBannerPhase({
    status: assessment.status,
    ranCount,
    expectedCount,
    hasInProgressMeeting: inProgressMeeting !== null,
  });

  return {
    assessment,
    aggregate,
    ranCount,
    expectedCount,
    phase,
    inProgressMeeting,
  };
}
