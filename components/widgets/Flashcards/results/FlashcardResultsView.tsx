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
import { EXTEND_MS, usePeriodAccess } from '@/hooks/usePeriodAccess';
import { useServerNow } from '@/hooks/useServerNow';
import { hasPeriodAccess, studentCanEnter } from '@/utils/periodAccess';
import { ActionButton } from '@/components/common/sessionViews/ActionButton';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { PeriodAccessStrip } from '@/components/widgets/QuizWidget/components/monitor/PeriodAccessStrip';
import { FlashcardStudyResults } from './FlashcardStudyResults';
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
}

const isPublished = (
  visibility: FlashcardScoreVisibility | undefined
): boolean => visibility !== undefined && visibility !== 'none';

export const FlashcardResultsView: React.FC<FlashcardResultsViewProps> = ({
  assignment,
  onBack,
  onPublishScores,
  onUnpublishScores,
}) => {
  const { orgId } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const { session, results, loading, error, resetStudent, resolveFlag } =
    useFlashcardResults(assignment.sessionId);
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

  const visibleResults = useMemo(
    () => filterResultsByClass(results, classFilter),
    [classFilter, results]
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

  const published = isPublished(
    session?.scoreVisibility ?? assignment.scoreVisibility
  );

  const publishAction =
    assignment.kind !== 'check' ? null : (
      <button
        type="button"
        onClick={() =>
          published ? void handleUnpublish() : setPublishOpen(true)
        }
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
        icon={Play}
        onClick={() => void runPeriod(periodActions.startAll)}
      />
      <ActionButton
        variant="secondary"
        label="Pause all"
        icon={Pause}
        onClick={() => void runPeriod(periodActions.pauseAll)}
      />
      {publishAction}
    </>
  ) : (
    publishAction
  );

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <SessionViewHeader
        onBack={onBack}
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
          {[null, ...presentClassIds].map((id) => (
            <button
              key={id ?? 'all'}
              type="button"
              aria-pressed={classFilter === id}
              onClick={() => setClassFilter(id)}
              className={`rounded-full border font-bold ${
                classFilter === id
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
          />
        )}
      </div>

      {publishOpen && (
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
      )}
    </div>
  );
};
