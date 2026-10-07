// Data hooks for the PLC Data overview: aggregates, assessments, targets, goals and the meeting strip.

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Plc, PlcGoal, TeamHeroRef } from '@/types';
import { useAuth } from '@/context/useAuth';
import { usePlcAggregate } from '@/hooks/usePlcAggregate';
import { usePlcAssessments } from '@/hooks/usePlcAssessments';
import { usePlcLearningTargets } from '@/hooks/useLearningTargets';
import { usePlcGoals } from '@/hooks/usePlcGoals';
import { usePlcNotes } from '@/hooks/usePlcNotes';
import { selectDecisionsToRevisit } from '@/utils/plcNoteBlocks';
import { usePlcGoalCoach } from '@/hooks/usePlcGoalCoach';
import { saveTeamLayout, useTeamTypeDefaults } from '@/hooks/useTeamLayout';
import {
  routineFor,
  useGoalRoutineOptions,
} from '@/components/plc/goals/routineOptions';
import { getPlcMembers } from '@/utils/plc';
import { resolveTeamLayout } from '@/utils/teamLayout';
import {
  buildPlcAssessmentPath,
  buildPlcPath,
  spaNavigate,
} from '@/utils/plcPath';
import {
  formatCadenceTime,
  formatDateKeyShort,
  nextMeetingOccurrence,
} from '@/utils/plcMeetingCadence';
import {
  buildDataOverviewModel,
  countOpenItems,
  type DataOverviewInput,
} from './dataOverviewModel';

/** Everything the selectors need, live from Firestore (or the mounted PlcProvider). */
export function useDataOverviewInput(
  plc: Plc,
  heroRef: TeamHeroRef | null
): { input: DataOverviewInput; loading: boolean } {
  const { aggregates, loading: aggLoading } = usePlcAggregate(plc.id);
  const { assessments, loading: assessLoading } = usePlcAssessments(plc.id);
  const targetList = usePlcLearningTargets(plc.id);
  const teacherUids = useMemo(
    () =>
      getPlcMembers(plc)
        .filter((m) => m.role !== 'viewer')
        .map((m) => m.uid),
    [plc]
  );
  const input = useMemo<DataOverviewInput>(
    () => ({
      aggregates,
      assessments,
      targets: targetList.list?.targets ?? [],
      ...(targetList.list?.masteryCutoffs
        ? { cutoffs: targetList.list.masteryCutoffs }
        : {}),
      teacherUids,
      heroRef,
    }),
    [aggregates, assessments, targetList.list, teacherUids, heroRef]
  );
  return { input, loading: aggLoading || assessLoading };
}

export function useDataOverviewModel(plc: Plc, heroRef: TeamHeroRef | null) {
  const { input, loading } = useDataOverviewInput(plc, heroRef);
  const model = useMemo(() => buildDataOverviewModel(input), [input]);
  return { model, input, loading };
}

export function usePlcNavigation(plcId: string) {
  return useMemo(
    () => ({
      openAssessment: (assessmentId: string) =>
        spaNavigate(buildPlcAssessmentPath(plcId, assessmentId)),
      allAssessments: () => spaNavigate(buildPlcPath(plcId, 'assessments')),
      openNotes: () => spaNavigate(buildPlcPath(plcId, 'docs')),
    }),
    [plcId]
  );
}

/** T6: a lead drops the pin so the hero follows the type's default again. */
export function useFollowLatest(plc: Plc) {
  const adminDefaults = useTeamTypeDefaults();
  return useCallback(async () => {
    const layout = resolveTeamLayout(plc, adminDefaults);
    await saveTeamLayout(plc.id, { ...layout, hero: { mode: 'default' } });
  }, [plc, adminDefaults]);
}

/** Goals with routine-backed practices resolved to names, plus the gated coach. */
export function useGoals(plc: Plc) {
  const { canAccessFeature } = useAuth();
  const goalsState = usePlcGoals(plc.id);
  const routines = useGoalRoutineOptions();
  const coach = usePlcGoalCoach(plc.id);
  const practicesFor = useCallback(
    (goal: PlcGoal | null): string[] =>
      (goal?.practices ?? [])
        .map((p) =>
          p.routineId
            ? (routineFor(routines, p.routineId)?.name ?? p.text)
            : p.text
        )
        .filter((s) => s.trim().length > 0),
    [routines]
  );
  return {
    ...goalsState,
    routines,
    practicesFor,
    coach: canAccessFeature('plc-goal-coach') ? coach : undefined,
  };
}

/** Next scheduled meeting text and open action items for the strip. */
export function useMeetingStrip(plc: Plc) {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const { notes } = usePlcNotes(plc.id);
  const [now] = useState(() => Date.now());
  const nextMeeting = useMemo(() => {
    const cadence = plc.meetingCadence;
    if (!cadence) return null;
    const occurrence = nextMeetingOccurrence(cadence, now);
    if (!occurrence) return null;
    return `${formatDateKeyShort(occurrence.date, i18n.language)} · ${formatCadenceTime(cadence.time, i18n.language)}`;
  }, [plc.meetingCadence, i18n.language, now]);
  const openItems = useMemo(() => {
    const counts = countOpenItems(notes, user?.uid ?? null);
    return counts.total > 0 ? counts : null;
  }, [notes, user?.uid]);
  const revisit = useMemo(() => {
    const due = selectDecisionsToRevisit(notes, now);
    const next = due[0]?.block.revisitAt;
    return next != null ? { count: due.length, next } : null;
  }, [notes, now]);
  return { nextMeeting, openItems, revisit };
}
