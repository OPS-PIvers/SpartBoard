// One assigned Writing session on the In Progress or Completed tab.
import React, { useCallback } from 'react';
import { Calendar, Pause, PowerOff, Rocket, Trash2 } from 'lucide-react';
import type { WritingAssignmentRecord } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import {
  usePeriodAccess,
  type PeriodAccessPatch,
} from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { updateWritingSession } from '@/hooks/useWritingAssignmentSessions';
import { hasPeriodAccess } from '@/utils/periodAccess';
import {
  AssignmentArchiveCard,
  type LibraryMenuAction,
} from '@/components/common/library';

const day = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export const WritingAssignmentRow: React.FC<{
  record: WritingAssignmentRecord;
  mode: 'active' | 'archive';
  tourIndex: number;
  onEnd: (record: WritingAssignmentRecord) => void;
  onDelete: (record: WritingAssignmentRecord) => void;
}> = ({ record: r, mode, tourIndex, onEnd, onDelete }) => {
  const { rosters, addToast } = useDashboard();
  // Manual: each class starts paused; Start and Pause go through the server, as no client writes the session.
  const perPeriod = mode === 'active' && hasPeriodAccess(r);
  const commit = useCallback(
    (patch: PeriodAccessPatch) =>
      updateWritingSession({ sessionId: r.id, ...patch }),
    [r.id]
  );
  const periods = usePeriodAccess(
    perPeriod ? r : null,
    {
      sessionCollection: 'writing_assignment_sessions',
      assignmentCollection: 'writing_assignment_records',
      refreshIdle: false,
      commit,
    },
    rosters
  );
  const runPeriod = usePeriodRunner(
    r.periodAccess,
    'WritingAssignmentRow.periodAccess'
  );
  const paused =
    perPeriod &&
    Object.values(r.periodAccess ?? {}).every((p) => p.state !== 'open');
  const classes = (r.periodNames ?? []).filter(Boolean);
  const classLabel =
    classes.length === 1
      ? classes[0]
      : classes.length > 0
        ? `${classes.length} classes`
        : null;
  const icon = { width: 'min(12px, 3cqmin)', height: 'min(12px, 3cqmin)' };
  const secondaries: LibraryMenuAction[] = [
    ...(perPeriod && !paused
      ? [
          {
            id: 'pause',
            label: 'Pause',
            icon: Pause,
            onClick: () =>
              void runPeriod(async () => {
                await periods.pauseAll();
                addToast('Assignment paused.', 'success');
              }),
          },
        ]
      : []),
    ...(mode === 'active'
      ? [
          {
            id: 'deactivate',
            label: 'End',
            icon: PowerOff,
            destructive: true,
            onClick: () => onEnd(r),
          },
        ]
      : []),
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onClick: () => onDelete(r),
    },
  ];
  return (
    <AssignmentArchiveCard<WritingAssignmentRecord>
      assignment={r}
      tourIndex={tourIndex}
      tourWidgetType="writing"
      mode={mode}
      status={
        mode === 'archive'
          ? { label: 'Ended', tone: 'neutral' }
          : paused
            ? { label: 'Paused', tone: 'warn', dot: true }
            : { label: 'Live', tone: 'success', dot: true }
      }
      title={r.title || 'Untitled writing assignment'}
      subtitle={typeof r.dueAt === 'number' ? `Due ${day(r.dueAt)}` : undefined}
      meta={
        <>
          <span
            className="inline-flex items-center"
            style={{ gap: 'min(2px, 0.5cqmin)' }}
          >
            <Calendar style={icon} />
            {day(r.createdAt)}
          </span>
          {classLabel && (
            <span
              className="truncate font-semibold"
              style={{ maxWidth: 'min(160px, 36cqmin)' }}
              title={classes.join(', ')}
            >
              {classLabel}
            </span>
          )}
        </>
      }
      primaryAction={
        paused
          ? {
              label: 'Start',
              icon: Rocket,
              onClick: () => void runPeriod(periods.startAll),
            }
          : undefined
      }
      secondaryActions={secondaries}
    />
  );
};
