import React, { useMemo, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { staffResultsLabel } from '@/utils/staffAudience';
import type { FlashcardAssignment } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import {
  formatStudentName,
  useAssignmentPseudonymsMulti,
} from '@/hooks/useAssignmentPseudonyms';
import { useFlashcardResults } from '@/hooks/useFlashcardResults';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { SessionViewHeader } from '@/components/common/sessionViews/SessionViewHeader';
import { LaunchedBySubTag } from '@/components/common/sessionViews/LaunchedBySubTag';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { filterResultsByClass } from '@/utils/flashcardResults';
import { speakLanguageOf } from '@/config/pronunciationGroups';
import { EXTEND_MS, usePeriodAccess } from '@/hooks/usePeriodAccess';
import { useServerNow } from '@/hooks/useServerNow';
import { hasPeriodAccess, studentCanEnter } from '@/utils/periodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { tourTypeAttr } from '@/config/tourAnchors';
import {
  ClassPicker,
  PeriodBar,
} from '@/components/widgets/QuizWidget/components/monitor/PeriodBar';
import type { MonitorRosterPrefs } from '@/components/widgets/QuizWidget/components/monitor/rosterStyles';
import { logError } from '@/utils/logError';
import {
  flashcardClassVisibility,
  isFlashcardPublished,
} from '@/utils/flashcardResultsVisibility';
import type { StudentResultsActions } from '@/components/widgets/QuizWidget/components/results/studentResultsSelection';
import { FlashcardMonitor } from './FlashcardMonitor';
import { FlashcardResultsScreen } from './FlashcardResultsScreen';
import { useSyncPlcFlashcardResult } from './useSyncPlcFlashcardResult';
import {
  FlashcardPublishScoresModal,
  type PublishableFlashcardVisibility,
} from './FlashcardPublishScoresModal';

interface FlashcardResultsViewProps {
  assignment: FlashcardAssignment;
  onBack: () => void;
  onPublishScores: (
    assignmentId: string,
    visibility: PublishableFlashcardVisibility
  ) => Promise<void>;
  onUnpublishScores: (assignmentId: string) => Promise<void>;
  /** Refresh the PLC-shared summary while open. */
  syncPlcShare?: boolean;
  /** Ends the assignment for every class (Close all). */
  onEnd?: () => Promise<void>;
  /** Student list switches, sort and filter, kept in widget config like Quiz's. */
  monitorPrefs?: MonitorRosterPrefs;
  onUpdateMonitorPrefs?: (updates: Partial<MonitorRosterPrefs>) => void;
  /** flashcards-assign-v2: Results opens a Check's Results screen; Monitor opens the live monitor. */
  screen?: 'monitor' | 'results';
}

export const FlashcardResultsView: React.FC<FlashcardResultsViewProps> = ({
  assignment,
  onBack,
  onPublishScores,
  onUnpublishScores,
  syncPlcShare = false,
  onEnd,
  monitorPrefs,
  onUpdateMonitorPrefs,
  screen = 'monitor',
}) => {
  const { orgId, canAccessFeature } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const {
    session,
    results,
    loading,
    error,
    resetStudent,
    resolveFlag,
    setResultsOverride,
  } = useFlashcardResults(assignment.sessionId);
  useSyncPlcFlashcardResult(
    assignment,
    session,
    results,
    // A session linked to the PLC is pooled on the server instead.
    syncPlcShare && !loading && !error && !session?.plcId
  );
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const now = useMinuteClock();
  // Per-period sessions get one chip per period, Start/Pause all and Let in now.
  const perPeriod =
    !!session && hasPeriodAccess(session) && session.status !== 'ended';
  const periodActions = usePeriodAccess(
    perPeriod ? session : null,
    {
      sessionCollection: 'flashcard_sessions',
      assignmentCollection: 'flashcard_assignments',
      refreshIdle: false,
    },
    rosters
  );
  const runPeriod = usePeriodRunner(
    session?.periodAccess,
    'FlashcardResultsView.periodAccess'
  );
  const periodNow = useServerNow(perPeriod ? 30_000 : null);
  // Only students with progress are listed, so one who never got in can't be let in from here.
  const letInFor = (studentUid: string): (() => void) | undefined => {
    const result = results.find((r) => r.studentUid === studentUid);
    if (!perPeriod || !result || typeof result.submittedAt === 'number')
      return undefined;
    if (
      studentCanEnter(
        session,
        result.classId ? [result.classId] : [],
        studentUid,
        periodNow
      )
    )
      return undefined;
    return () => void runPeriod(() => periodActions.letIn(studentUid));
  };

  const classIds = useMemo(
    () => session?.classIds ?? assignment.classIds ?? [],
    [assignment.classIds, session?.classIds]
  );
  const { byStudentUid } = useAssignmentPseudonymsMulti(
    assignment.sessionId,
    classIds,
    orgId
  );

  // FlashcardProgress.classId is a raw class id, so labels come from rosters.
  const classLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const roster of rosters) {
      if (roster.classlinkClassId)
        labels[roster.classlinkClassId] = roster.name;
      if (roster.testClassId) labels[roster.testClassId] = roster.name;
    }
    return labels;
  }, [rosters]);

  const presentClassIds = useMemo(() => {
    const ids = new Set<string>();
    for (const result of results) if (result.classId) ids.add(result.classId);
    return [...ids].sort((a, b) =>
      (classLabels[a] ?? a).localeCompare(classLabels[b] ?? b)
    );
  }, [classLabels, results]);

  // A class that left the list (ended period strip, last student reset) falls back to All classes.
  const activeFilter =
    classFilter &&
    (presentClassIds.includes(classFilter) ||
      (perPeriod && !!session?.periodAccess?.[classFilter]))
      ? classFilter
      : null;
  const visibleResults = useMemo(
    () => filterResultsByClass(results, activeFilter),
    [activeFilter, results]
  );

  const nameFor = useMemo(() => {
    // Staff-audience progress names its own staff member.
    const staffNames = new Map<string, string>();
    for (const result of results) {
      const label = staffResultsLabel(result);
      if (label) staffNames.set(result.studentUid, label);
    }
    return (studentUid: string): string =>
      staffNames.get(studentUid) ??
      (formatStudentName(byStudentUid.get(studentUid)) ||
        `Student ${studentUid.slice(0, 6)}`);
  }, [byStudentUid, results]);

  const sortNameFor = useMemo(
    () =>
      (studentUid: string): string => {
        const name = byStudentUid.get(studentUid);
        return name && (name.familyName || name.givenName)
          ? `${name.familyName} ${name.givenName}`.trim()
          : nameFor(studentUid);
      },
    [byStudentUid, nameFor]
  );
  const classLabelFor = useMemo(
    () =>
      (classId: string): string =>
        classLabels[classId] ?? classId,
    [classLabels]
  );

  const testsByStudent = useMemo(() => {
    const map: Record<string, { at: number; count: number; score: number }[]> =
      {};
    for (const result of visibleResults)
      map[result.studentUid] = result.tests ?? [];
    return map;
  }, [visibleResults]);

  const handleReset = async (studentUid: string): Promise<void> => {
    const confirmed = await showConfirm(
      `Reset ${nameFor(studentUid)}? Their progress and any submission for this assignment are deleted and they start over.`,
      { title: 'Reset student', variant: 'danger', confirmLabel: 'Reset' }
    );
    if (!confirmed) return;
    try {
      await resetStudent(studentUid);
      addToast(`${nameFor(studentUid)} reset.`, 'success');
    } catch (resetError) {
      addToast(
        resetError instanceof Error
          ? resetError.message
          : 'Student could not be reset.',
        'error'
      );
    }
  };

  // Quiz's Remove student: confirmed in the menu, so no dialog and no success toast.
  const handleRemove = async (studentUid: string): Promise<void> => {
    try {
      await resetStudent(studentUid);
    } catch (removeError) {
      logError('FlashcardResultsView.remove', removeError);
      addToast('Could not remove the student. Try again.', 'error');
    }
  };

  const handleResolveFlag = async (
    studentUid: string,
    cardId: string,
    accept: boolean
  ): Promise<void> => {
    try {
      await resolveFlag(studentUid, cardId, accept);
      addToast(accept ? 'Answer accepted.' : 'Flag dismissed.', 'success');
    } catch (flagError) {
      addToast(
        flagError instanceof Error
          ? flagError.message
          : 'Flag could not be resolved.',
        'error'
      );
    }
  };

  const handleCloseAll = async (onConfirmed: () => void): Promise<void> => {
    if (!onEnd) return;
    const confirmed = await showConfirm(
      `Close “${assignment.setTitle}” for every class? Students lose access, but their progress is saved.`,
      {
        title: 'Close for all classes',
        variant: 'warning',
        confirmLabel: 'Close all',
      }
    );
    if (!confirmed) return;
    onConfirmed();
    try {
      await onEnd();
      addToast(`“${assignment.setTitle}” closed.`, 'success');
    } catch (endError) {
      addToast(
        endError instanceof Error
          ? endError.message
          : 'Assignment could not be closed.',
        'error'
      );
    }
  };

  const handleUnpublish = async (): Promise<void> => {
    const confirmed = await showConfirm(
      `Hide scores for “${assignment.setTitle}”? Students stop seeing their results.`,
      { title: 'Hide scores', variant: 'warning', confirmLabel: 'Hide scores' }
    );
    if (!confirmed) return;
    try {
      await onUnpublishScores(assignment.id);
      addToast('Scores hidden.', 'success');
    } catch (publishError) {
      addToast(
        publishError instanceof Error
          ? publishError.message
          : 'Scores could not be hidden.',
        'error'
      );
    }
  };

  // F10: the Speaking view needs the flag and a Speak stamp on this assignment.
  const speakLanguage =
    session?.speak && canAccessFeature('flashcards-speak')
      ? speakLanguageOf(session.termLanguage)
      : null;

  const quizStyle = canAccessFeature('flashcards-assign-v2');

  const published = isFlashcardPublished(
    session?.scoreVisibility ?? assignment.scoreVisibility
  );

  // Quiz's per-student Show / Hide / Follow class, on each student's own progress doc.
  const studentResultsActions = useMemo<StudentResultsActions>(
    () => ({
      publish: async (keys, visibility, expiresAt, protection) => {
        const submitted = new Set(
          results
            .filter((r) => typeof r.submittedAt === 'number')
            .map((r) => r.studentUid)
        );
        const shown = keys.filter((key) => submitted.has(key));
        await setResultsOverride(shown, {
          mode: 'shown',
          visibility,
          publishedAt: Date.now(),
          expiresAt,
          ...(protection ? { protection } : {}),
        });
        return {
          responsesUpdated: shown.length,
          skipped: keys.length - shown.length,
        };
      },
      hide: (keys) =>
        setResultsOverride(keys, { mode: 'hidden', publishedAt: Date.now() }),
      clear: (keys) => setResultsOverride(keys, null),
    }),
    [results, setResultsOverride]
  );

  const publishModal = publishOpen && (
    <FlashcardPublishScoresModal
      assignmentTitle={assignment.setTitle || 'Untitled set'}
      currentVisibility={session?.scoreVisibility}
      onClose={() => setPublishOpen(false)}
      onConfirm={async (visibility) => {
        try {
          await onPublishScores(assignment.id, visibility);
          addToast('Scores published.', 'success');
          setPublishOpen(false);
        } catch (publishError) {
          addToast(
            publishError instanceof Error
              ? publishError.message
              : 'Scores could not be published.',
            'error'
          );
        }
      }}
    />
  );

  if (loading)
    return (
      <div className="flex h-full items-center justify-center bg-white text-brand-gray-light">
        <Loader2
          className="animate-spin"
          aria-label="Loading results"
          style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
        />
      </div>
    );
  if (
    !error &&
    session &&
    quizStyle &&
    session.kind === 'check' &&
    screen === 'results'
  ) {
    const launchedBy = assignment.launchedBy ? (
      <LaunchedBySubTag
        launchedBy={assignment.launchedBy}
        at={assignment.createdAt}
      />
    ) : null;
    return (
      <FlashcardResultsScreen
        assignment={assignment}
        session={session}
        results={visibleResults}
        nameFor={nameFor}
        sortNameFor={sortNameFor}
        classLabelFor={classLabelFor}
        exportNames={byStudentUid}
        speakLanguage={speakLanguage}
        onBack={onBack}
        classControls={
          presentClassIds.length > 1 ? (
            <ClassPicker
              names={presentClassIds}
              labelFor={classLabelFor}
              selected={activeFilter ?? ''}
              onSelect={(id) => setClassFilter(id || null)}
              status={
                session.status === 'ended' || assignment.status === 'ended'
                  ? 'ended'
                  : 'active'
              }
              selectAnchor={tourTypeAttr(
                'flashcards.class-picker',
                'flashcards'
              )}
            />
          ) : null
        }
        launchedBy={launchedBy}
        addToast={addToast}
        studentResultsActions={studentResultsActions}
        classVisibility={flashcardClassVisibility(
          session.scoreVisibility ?? assignment.scoreVisibility
        )}
      />
    );
  }
  if (!error && session) {
    const classControls =
      perPeriod && session.periodAccess ? (
        <PeriodBar
          periodAccess={session.periodAccess}
          selected={activeFilter ?? ''}
          onSelect={(key) => setClassFilter(key || null)}
          onStart={(key) => runPeriod(() => periodActions.startPeriod(key))}
          onPause={(key) => runPeriod(() => periodActions.pausePeriod(key))}
          onExtend={(key, by) =>
            runPeriod(() => periodActions.extendPeriod(key, by))
          }
          extendMs={EXTEND_MS}
          anchors={{
            select: tourTypeAttr('flashcards.class-picker', 'flashcards'),
            start: tourTypeAttr('flashcards.period-start', 'flashcards'),
            pause: tourTypeAttr('flashcards.period-pause', 'flashcards'),
            moreTime: tourTypeAttr('flashcards.period-more-time', 'flashcards'),
            extend: tourTypeAttr('flashcards.period-extend', 'flashcards'),
          }}
        />
      ) : presentClassIds.length > 1 ? (
        <ClassPicker
          names={presentClassIds}
          labelFor={(id) => classLabels[id] ?? id}
          selected={activeFilter ?? ''}
          onSelect={(id) => setClassFilter(id || null)}
          status={
            session.status === 'ended' || assignment.status === 'ended'
              ? 'ended'
              : 'active'
          }
          selectAnchor={tourTypeAttr('flashcards.class-picker', 'flashcards')}
        />
      ) : null;
    return (
      <>
        <FlashcardMonitor
          assignment={assignment}
          session={session}
          results={visibleResults}
          tests={testsByStudent}
          nameFor={nameFor}
          now={now}
          speakLanguage={speakLanguage}
          published={published}
          onBack={onBack}
          onResetStudent={(uid) =>
            void (quizStyle ? handleRemove(uid) : handleReset(uid))
          }
          quizStyle={quizStyle}
          prefs={monitorPrefs}
          onUpdatePrefs={onUpdateMonitorPrefs}
          onResolveFlag={handleResolveFlag}
          letInFor={letInFor}
          onPublish={() =>
            published ? void handleUnpublish() : setPublishOpen(true)
          }
          onEnd={onEnd ? handleCloseAll : undefined}
          classControls={classControls}
          launchedBy={
            assignment.launchedBy ? (
              <LaunchedBySubTag
                launchedBy={assignment.launchedBy}
                at={assignment.createdAt}
              />
            ) : null
          }
        />
        {publishModal}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <SessionViewHeader
        onBack={onBack}
        backAnchor={tourTypeAttr('flashcards.results-back', 'flashcards')}
        status={assignment.status === 'ended' ? 'ended' : 'none'}
        title={assignment.setTitle || 'Untitled set'}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ScaledEmptyState
          icon={BarChart3}
          title="Results are unavailable"
          subtitle={error ?? 'This assignment no longer exists.'}
          titleClassName="text-slate-800"
          subtitleClassName="text-slate-500"
        />
      </div>
    </div>
  );
};
