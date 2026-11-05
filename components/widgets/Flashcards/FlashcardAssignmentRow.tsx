import React from 'react';
import {
  BarChart3,
  Calendar,
  EyeOff,
  Monitor,
  Pause,
  PowerOff,
  Radio,
  RefreshCw,
  Rocket,
  Send,
  Settings as SettingsIcon,
  Share2,
  Trash2,
  Users2,
} from 'lucide-react';
import type { FlashcardAssignment } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { usePeriodAccess } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { hasPeriodAccess } from '@/utils/periodAccess';
import {
  flashcardAssignmentPaused,
  flashcardAssignmentSubtitle,
} from './utils/flashcardAssignmentRow';
import { AssignmentArchiveCard } from '@/components/common/library';
import type { LibraryMenuAction } from '@/components/common/library';

export interface FlashcardAssignmentRowHandlers {
  onMonitor: (assignment: FlashcardAssignment) => void;
  onResults: (assignment: FlashcardAssignment) => void;
  /** Absent until the assign modal can edit an assignment. */
  onSettings?: (assignment: FlashcardAssignment) => void;
  /** Absent when the set behind the assignment is gone. */
  onShare?: (assignment: FlashcardAssignment) => void;
  onPublishScores: (assignment: FlashcardAssignment) => void;
  onUnpublishScores: (assignment: FlashcardAssignment) => void;
  onEnd: (assignment: FlashcardAssignment) => void;
  onReopen: (assignment: FlashcardAssignment) => void;
  onDelete: (assignment: FlashcardAssignment) => void;
  onStopSharingWithPlc?: (assignment: FlashcardAssignment) => void;
}

interface FlashcardAssignmentRowProps extends FlashcardAssignmentRowHandlers {
  assignment: FlashcardAssignment;
  mode: 'active' | 'archive';
  tourIndex: number;
}

/** In Progress / Completed row laid out and ordered like QuizManager's. */
export const FlashcardAssignmentRow: React.FC<FlashcardAssignmentRowProps> = ({
  assignment: a,
  mode,
  tourIndex,
  onMonitor,
  onResults,
  onSettings,
  onShare,
  onPublishScores,
  onUnpublishScores,
  onEnd,
  onReopen,
  onDelete,
  onStopSharingWithPlc,
}) => {
  const { rosters, addToast } = useDashboard();
  const perPeriod = mode === 'active' && hasPeriodAccess(a);
  const periods = usePeriodAccess(
    perPeriod ? { ...a, id: a.sessionId } : null,
    {
      sessionCollection: 'flashcard_sessions',
      assignmentCollection: 'flashcard_assignments',
      refreshIdle: false,
      assignmentId: a.id,
    },
    rosters
  );
  const runPeriod = usePeriodRunner(
    a.periodAccess,
    'FlashcardAssignmentRow.periodAccess'
  );
  const paused = perPeriod && flashcardAssignmentPaused(a);
  const isCheck = a.kind === 'check';
  const published = !!a.scoreVisibility && a.scoreVisibility !== 'none';

  const secondaries: LibraryMenuAction[] = [];
  const pushSettingsAndShare = (): void => {
    if (onSettings)
      secondaries.push({
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        onClick: () => onSettings(a),
      });
    if (onShare)
      secondaries.push({
        id: 'share',
        label: 'Share',
        icon: Share2,
        onClick: () => onShare(a),
      });
  };
  const pushDelete = (): void => {
    secondaries.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onClick: () => onDelete(a),
    });
  };
  const pushStopPlc = (): void => {
    if (a.plcShare && onStopSharingWithPlc)
      secondaries.push({
        id: 'stop-sharing-plc',
        label: 'Stop sharing with PLC',
        icon: Users2,
        onClick: () => onStopSharingWithPlc(a),
      });
  };

  let primary: {
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    onClick: () => void;
  };
  if (mode === 'active') {
    primary = paused
      ? {
          label: 'Start',
          icon: Rocket,
          onClick: () =>
            void runPeriod(async () => {
              const untimed = await periods.startAll();
              onMonitor(a);
              return untimed;
            }),
        }
      : { label: 'Monitor', icon: Monitor, onClick: () => onMonitor(a) };
    if (!paused)
      secondaries.push({
        id: 'monitor',
        label: 'Monitor',
        icon: Monitor,
        onClick: () => onMonitor(a),
      });
    secondaries.push({
      id: 'results',
      label: 'Results',
      icon: BarChart3,
      onClick: () => onResults(a),
    });
    pushSettingsAndShare();
    if (perPeriod && !paused)
      secondaries.push({
        id: 'pause',
        label: 'Pause',
        icon: Pause,
        onClick: () =>
          void runPeriod(async () => {
            await periods.pauseAll();
            addToast('Assignment paused.', 'success');
          }),
      });
    secondaries.push({
      id: 'deactivate',
      label: 'End',
      icon: PowerOff,
      destructive: true,
      onClick: () => onEnd(a),
    });
    pushDelete();
    pushStopPlc();
  } else {
    primary = {
      label: 'Results',
      icon: BarChart3,
      onClick: () => onResults(a),
    };
    secondaries.push({
      id: 'monitor',
      label: 'Monitor',
      icon: Monitor,
      onClick: () => onMonitor(a),
    });
    pushSettingsAndShare();
    if (isCheck) {
      secondaries.push({
        id: 'publish-scores',
        label: published ? 'Update published scores' : 'Publish scores',
        icon: Send,
        onClick: () => onPublishScores(a),
      });
      if (published)
        secondaries.push({
          id: 'unpublish-scores',
          label: 'Unpublish scores',
          icon: EyeOff,
          onClick: () => onUnpublishScores(a),
        });
    }
    secondaries.push({
      id: 'reopen',
      label: 'Reopen',
      icon: RefreshCw,
      onClick: () => onReopen(a),
    });
    pushDelete();
    pushStopPlc();
  }

  const classes = (a.periodNames ?? []).filter(Boolean);
  const classLabel =
    classes.length === 1
      ? classes[0]
      : classes.length > 0
        ? `${classes.length} classes`
        : null;
  const live = mode === 'active' && !paused;
  const icon = { width: 'min(12px, 3cqmin)', height: 'min(12px, 3cqmin)' };
  const meta = (
    <>
      <span
        className="inline-flex items-center"
        style={{ gap: 'min(2px, 0.5cqmin)' }}
      >
        <Calendar style={icon} />
        {new Date(a.createdAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </span>
      {classLabel != null ? (
        <span
          className="font-semibold truncate"
          style={{ maxWidth: 'min(120px, 30cqmin)' }}
          title={classes.join(', ')}
        >
          {classLabel}
        </span>
      ) : a.audience === 'staff' ? (
        <span className="font-semibold">Staff</span>
      ) : mode === 'active' ? (
        <span
          className="font-semibold text-amber-600 truncate"
          style={{ maxWidth: 'min(120px, 30cqmin)' }}
        >
          No classes
        </span>
      ) : null}
      {live && (
        <span className="inline-flex items-center">
          <Radio style={icon} />
        </span>
      )}
    </>
  );

  return (
    <AssignmentArchiveCard<FlashcardAssignment>
      assignment={a}
      tourIndex={tourIndex}
      tourWidgetType="flashcards"
      mode={mode}
      status={
        mode === 'archive'
          ? { label: 'Ended', tone: 'neutral' }
          : paused
            ? { label: 'Paused', tone: 'warn', dot: true }
            : { label: 'Live', tone: 'success', dot: true }
      }
      title={a.setTitle || 'Untitled set'}
      subtitle={flashcardAssignmentSubtitle(a)}
      meta={meta}
      primaryAction={primary}
      secondaryActions={secondaries.filter((m) => m.label !== primary.label)}
    />
  );
};
