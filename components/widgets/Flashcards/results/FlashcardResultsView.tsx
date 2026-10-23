import React, { useMemo, useState } from 'react';
import { BarChart3, EyeOff, Loader2, Pause, Play, Send } from 'lucide-react';
import type { FlashcardAssignment, FlashcardScoreVisibility } from '@/types';
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
import { ActionButton } from '@/components/common/sessionViews/ActionButton';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { PeriodAccessStrip } from '@/components/widgets/QuizWidget/components/monitor/PeriodAccessStrip';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  ClassPicker,
  PeriodBar,
} from '@/components/widgets/QuizWidget/components/monitor/PeriodBar';
import { FlashcardStudyResults } from './FlashcardStudyResults';
import { FlashcardMonitor } from './FlashcardMonitor';
import { useSyncPlcFlashcardResult } from './useSyncPlcFlashcardResult';
import { FlashcardCheckReview } from './FlashcardCheckReview';
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
  /** Ends the assignment for every class (Close all on the monitor-parity layout). */
  onEnd?: () => Promise<void>;
}

const isPublished = (
  visibility: FlashcardScoreVisibility | undefined
): boolean => visibility !== undefined && visibility !== 'none';

export const FlashcardResultsView: React.FC<FlashcardResultsViewProps> = ({
  assignment,
  onBack,
  onPublishScores,
  onUnpublishScores,
  syncPlcShare = false,
  onEnd,
}) => {
  const { orgId, canAccessFeature } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const { session, results, loading, error, resetStudent, resolveFlag } =
    useFlashcardResults(assignment.sessionId);
  useSyncPlcFlashcardResult(
    assignment,
    session,
    results,
    syncPlcShare && !loading && !error
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
    return (studentUid: string): string =>
      formatStudentName(byStudentUid.get(studentUid)) ||
      `Student ${studentUid.slice(0, 6)}`;
  }, [byStudentUid]);

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

  const handleCloseAll = async (): Promise<void> => {
    if (!onEnd) return;
    const confirmed = await showConfirm(
      `Close “${assignment.setTitle}” for every class? Students lose access and their work is kept.`,
      {
        title: 'Close for all classes',
        variant: 'warning',
        confirmLabel: 'Close all',
      }
    );
    if (!confirmed) return;
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

  const published = isPublished(
    session?.scoreVisibility ?? assignment.scoreVisibility
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

  const publishAction =
    assignment.kind !== 'check' ? null : (
      <button
        type="button"
        onClick={() =>
          published ? void handleUnpublish() : setPublishOpen(true)
        }
        {...tourTypeAttr('flashcards.publish-scores', 'flashcards')}
        className="flex items-center rounded-xl bg-brand-blue-primary font-bold text-white hover:brightness-110"
        style={{
          gap: 'min(6px, 1.4cqmin)',
          fontSize: 'min(12px, 3.4cqmin)',
          padding: 'min(6px, 1.4cqmin) min(12px, 2.6cqmin)',
        }}
      >
        {published ? (
          <EyeOff
            aria-hidden="true"
            style={{
              width: 'min(14px, 3.6cqmin)',
              height: 'min(14px, 3.6cqmin)',
            }}
          />
        ) : (
          <Send
            aria-hidden="true"
            style={{
              width: 'min(14px, 3.6cqmin)',
              height: 'min(14px, 3.6cqmin)',
            }}
          />
        )}
        {published ? 'Hide scores' : 'Publish scores'}
      </button>
    );
  const actions = perPeriod ? (
    <>
      <ActionButton
        variant="secondary"
        label="Start all"
        anchor={tourTypeAttr('flashcards.period-start-all', 'flashcards')}
        icon={Play}
        onClick={() => void runPeriod(periodActions.startAll)}
      />
      <ActionButton
        variant="secondary"
        label="Pause all"
        anchor={tourTypeAttr('flashcards.period-pause-all', 'flashcards')}
        icon={Pause}
        onClick={() => void runPeriod(periodActions.pauseAll)}
      />
      {publishAction}
    </>
  ) : (
    publishAction
  );

  if (canAccessFeature('monitor-parity') && loading)
    return (
      <div className="flex h-full items-center justify-center bg-white text-brand-gray-light">
        <Loader2
          className="animate-spin"
          aria-label="Loading results"
          style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
        />
      </div>
    );
  if (canAccessFeature('monitor-parity') && !loading && !error && session) {
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
          labelOf={(id) => classLabels[id] ?? id}
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
          onResetStudent={(uid) => void handleReset(uid)}
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
        subtitle={
          assignment.kind === 'check'
            ? `Check · ${assignment.checkMode ?? 'write'}${published ? ' · scores published' : ''}`
            : 'Study'
        }
        actions={actions}
      />

      {perPeriod && session?.periodAccess && (
        <div
          className="flex shrink-0 border-b border-slate-200/70 bg-white/60"
          style={{ padding: 'min(6px, 1.6cqmin) min(16px, 3.5cqmin)' }}
        >
          <PeriodAccessStrip
            periodAccess={session.periodAccess}
            extendMs={EXTEND_MS}
            onStart={(key) => runPeriod(() => periodActions.startPeriod(key))}
            onPause={(key) => runPeriod(() => periodActions.pausePeriod(key))}
            onExtend={(key, by) =>
              runPeriod(() => periodActions.extendPeriod(key, by))
            }
          />
        </div>
      )}

      {assignment.launchedBy && (
        <div
          className="flex shrink-0 items-center border-b border-slate-200/70 bg-white/60"
          style={{ padding: 'min(6px, 1.6cqmin) min(16px, 3.5cqmin)' }}
        >
          <LaunchedBySubTag
            launchedBy={assignment.launchedBy}
            at={assignment.createdAt}
          />
        </div>
      )}

      {presentClassIds.length > 1 && (
        <div
          className="flex flex-wrap border-b border-slate-200/70 bg-white/60"
          style={{
            gap: 'min(6px, 1.4cqmin)',
            padding: 'min(8px, 1.8cqmin) min(16px, 3.5cqmin)',
          }}
        >
          {[null, ...presentClassIds].map((id, filterIndex) => (
            <button
              key={id ?? 'all'}
              type="button"
              aria-pressed={activeFilter === id}
              {...tourFieldAttr(
                'flashcards.results-class-filter',
                'flashcards',
                filterIndex === 0 ? 'all' : `class-${filterIndex}`
              )}
              onClick={() => setClassFilter(id)}
              className={`rounded-full border font-bold ${
                activeFilter === id
                  ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-dark'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              style={{
                fontSize: 'min(11px, 3.2cqmin)',
                padding: 'min(4px, 1cqmin) min(12px, 2.6cqmin)',
              }}
            >
              {id === null ? 'All periods' : (classLabels[id] ?? id)}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2
              className="animate-spin"
              aria-label="Loading results"
              style={{
                width: 'min(24px, 6cqmin)',
                height: 'min(24px, 6cqmin)',
              }}
            />
          </div>
        ) : error || !session ? (
          <ScaledEmptyState
            icon={BarChart3}
            title="Results are unavailable"
            subtitle={error ?? 'This assignment no longer exists.'}
            titleClassName="text-slate-800"
            subtitleClassName="text-slate-500"
          />
        ) : session.kind === 'check' ? (
          <FlashcardCheckReview
            session={session}
            results={visibleResults}
            nameFor={nameFor}
            onResetStudent={(uid) => void handleReset(uid)}
            onResolveFlag={handleResolveFlag}
            letInFor={letInFor}
          />
        ) : (
          <FlashcardStudyResults
            session={session}
            results={visibleResults}
            tests={testsByStudent}
            nameFor={nameFor}
            onResetStudent={(uid) => void handleReset(uid)}
            now={now}
            letInFor={letInFor}
            speakLanguage={speakLanguage}
          />
        )}
      </div>

      {publishModal}
    </div>
  );
};
