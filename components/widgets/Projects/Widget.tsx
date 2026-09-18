import React, { useMemo, useState } from 'react';
import { ClipboardList, Hand, Loader2 } from 'lucide-react';
import type {
  ProjectGroup,
  ProjectStep,
  ProjectStepState,
  ProjectsConfig,
  WidgetData,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useProjectRun } from '@/hooks/useProjectRun';
import { useProjectsWidgetSettings } from '@/hooks/useProjectsWidgetSettings';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ActiveClassChip } from '@/components/common/ActiveClassChip';
import { getFontClass, hexToRgba } from '@/utils/styles';
import {
  COMFORTABLE_GROUPS,
  COMFORTABLE_STEPS,
  STEP_STATE_LABELS,
  completedStepCount,
  groupsForClass,
  sortGroupsForBoard,
  stepStateOf,
  studentStateOptions,
} from './projectSteps';

/** Purposeful colour: one hue per state, nothing decorative (components/CLAUDE.md). */
const SEGMENT_COLORS: Record<ProjectStepState, string> = {
  notStarted: 'bg-slate-300/70',
  inProgress: 'bg-brand-blue-primary',
  readyForReview: 'bg-amber-400',
  done: 'bg-emerald-500',
};

const nextState = (
  step: ProjectStep,
  current: ProjectStepState
): ProjectStepState => {
  // The teacher cycles through every state including `done`; the ceiling in
  // `studentStateOptions` is the student's, not hers (D28).
  const options: ProjectStepState[] = studentStateOptions(step).concat(
    step.requiresApproval ? ['done'] : []
  );
  return options[(options.indexOf(current) + 1) % options.length];
};

const GroupRow: React.FC<{
  group: ProjectGroup;
  steps: ProjectStep[];
  showStatus: boolean;
  cardStyle: React.CSSProperties;
  onCycleStep: (stepId: string, state: ProjectStepState) => void;
  onClearSupport: () => void;
}> = ({ group, steps, showStatus, cardStyle, onCycleStep, onClearSupport }) => (
  <li
    className="flex items-center rounded-xl border-l-4 overflow-hidden"
    style={{
      ...cardStyle,
      borderLeftColor: group.needsSupport ? '#f59e0b' : 'transparent',
      gap: 'min(10px, 2cqmin)',
      padding: 'min(8px, 1.8cqmin) min(10px, 2.2cqmin)',
    }}
  >
    <span
      className="font-bold text-slate-800 truncate shrink-0"
      style={{ fontSize: 'min(15px, 5cqmin)', width: '28%' }}
    >
      {group.name}
    </span>

    {showStatus ? (
      <div
        className="flex flex-1 min-w-0"
        style={{ gap: 'min(3px, 0.6cqmin)' }}
        role="group"
        aria-label={`${group.name} progress`}
      >
        {steps.map((step) => {
          const state = stepStateOf(group, step.id);
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onCycleStep(step.id, state)}
              title={`${step.title} — ${STEP_STATE_LABELS[state]}`}
              aria-label={`${group.name}, ${step.title}, ${STEP_STATE_LABELS[state]}`}
              className={`flex-1 rounded-full transition-colors ${SEGMENT_COLORS[state]}`}
              style={{ height: 'min(14px, 3.2cqmin)' }}
            />
          );
        })}
      </div>
    ) : (
      <span
        className="flex-1 text-slate-500 font-medium"
        style={{ fontSize: 'min(13px, 4.2cqmin)' }}
      >
        {completedStepCount(group, steps)} of {steps.length} done
      </span>
    )}

    {group.needsSupport && (
      <button
        type="button"
        onClick={onClearSupport}
        className="shrink-0 flex items-center rounded-full bg-amber-100 text-amber-800 font-semibold"
        style={{
          gap: 'min(4px, 1cqmin)',
          padding: 'min(3px, 0.7cqmin) min(8px, 1.8cqmin)',
          fontSize: 'min(12px, 3.6cqmin)',
        }}
        aria-label={`Clear the help flag for ${group.name}`}
      >
        <Hand
          aria-hidden
          style={{
            width: 'min(13px, 3.4cqmin)',
            height: 'min(13px, 3.4cqmin)',
          }}
        />
        Help
      </button>
    )}
  </li>
);

export const ProjectsWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as ProjectsConfig;
  const {
    projectId,
    showStatus = true,
    fontFamily,
    cardColor = '#ffffff',
    cardOpacity = 0.75,
  } = config;

  const { updateWidget, rosters, activeRosterId, addToast, activeDashboard } =
    useDashboard();
  const { user } = useAuth();
  const { enabled } = useProjectsWidgetSettings();
  const { run, groups, loading, setStepState, setNeedsSupport } = useProjectRun(
    user?.uid,
    projectId,
    user?.uid
  );

  const [busyStepId, setBusyStepId] = useState<string | null>(null);

  const activeClassId = useMemo(
    () =>
      rosters.find((r) => r.id === activeRosterId)?.classlinkClassId ?? null,
    [activeRosterId, rosters]
  );

  const visibleGroups = useMemo(
    () => sortGroupsForBoard(groupsForClass(groups, activeClassId)),
    [activeClassId, groups]
  );

  const steps = run?.steps ?? [];
  const cardStyle = { backgroundColor: hexToRgba(cardColor, cardOpacity) };
  const fontClassName = getFontClass(
    fontFamily ?? 'global',
    activeDashboard?.globalStyle?.fontFamily ?? 'sans'
  );

  const runAction = async (action: Promise<void>, key: string) => {
    setBusyStepId(key);
    try {
      await action;
    } catch {
      addToast('That change could not be saved.', 'error');
    } finally {
      setBusyStepId(null);
    }
  };

  if (!enabled) {
    return (
      <ScaledEmptyState
        icon={ClipboardList}
        title="Projects is off"
        subtitle="An admin turns this on under Rollouts."
      />
    );
  }

  if (!projectId) {
    return (
      <ScaledEmptyState
        icon={ClipboardList}
        title="No project picked"
        subtitle="Flip this widget over to choose one."
      />
    );
  }

  if (loading) {
    return (
      <div className="h-full w-full bg-transparent flex items-center justify-center">
        <Loader2
          aria-label="Loading this project"
          className="animate-spin text-slate-300"
          style={{ width: 'min(32px, 12cqmin)', height: 'min(32px, 12cqmin)' }}
        />
      </div>
    );
  }

  if (!run) {
    return (
      <ScaledEmptyState
        icon={ClipboardList}
        title="Not started yet"
        subtitle="Flip over and import groups to start this project."
      />
    );
  }

  if (!activeClassId) {
    return (
      <ScaledEmptyState
        icon={ClipboardList}
        title="Pick a class"
        subtitle="This board shows the groups in whichever class is active."
      />
    );
  }

  if (visibleGroups.length === 0) {
    return (
      <ScaledEmptyState
        icon={ClipboardList}
        title="No groups in this class"
        subtitle="Flip over to import groups from the Group Maker."
      />
    );
  }

  // D26 — past the comfortable ceiling the face reports counts instead of
  // trying to draw every segment at an illegible size.
  const tooDenseToDraw =
    visibleGroups.length > COMFORTABLE_GROUPS ||
    steps.length > COMFORTABLE_STEPS;
  const renderStatus = showStatus && !tooDenseToDraw;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full bg-transparent flex flex-col ${fontClassName}`}
          style={{
            gap: 'min(8px, 1.8cqmin)',
            padding: 'min(12px, 2.6cqmin)',
          }}
        >
          <div
            className="flex items-center justify-between shrink-0"
            style={{ gap: 'min(8px, 1.8cqmin)' }}
          >
            <span
              className="font-black text-slate-800 truncate"
              style={{ fontSize: 'min(18px, 6cqmin)' }}
            >
              {run.title}
            </span>
            <div
              className="flex items-center"
              style={{ gap: 'min(6px, 1.4cqmin)' }}
            >
              <ActiveClassChip compact />
              <button
                type="button"
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, showStatus: !showStatus },
                  })
                }
                className="rounded-full bg-white/70 border border-slate-200 text-slate-600 font-semibold"
                style={{
                  padding: 'min(4px, 0.9cqmin) min(10px, 2.2cqmin)',
                  fontSize: 'min(12px, 3.6cqmin)',
                }}
                aria-pressed={showStatus}
              >
                {showStatus ? 'Hide status' : 'Show status'}
              </button>
            </div>
          </div>

          {tooDenseToDraw && showStatus && (
            <p
              className="shrink-0 text-slate-500"
              style={{ fontSize: 'min(11px, 3.4cqmin)' }}
            >
              {visibleGroups.length} groups × {steps.length} steps — showing
              counts instead of the bar.
            </p>
          )}

          <ul
            className="flex-1 min-h-0 overflow-y-auto flex flex-col"
            style={{ gap: 'min(6px, 1.4cqmin)' }}
          >
            {visibleGroups.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                steps={steps}
                showStatus={renderStatus}
                cardStyle={cardStyle}
                onCycleStep={(stepId, state) => {
                  const step = steps.find((s) => s.id === stepId);
                  if (!step || busyStepId) return;
                  void runAction(
                    setStepState(
                      group.id,
                      stepId,
                      nextState(step, state),
                      'teacher'
                    ),
                    `${group.id}:${stepId}`
                  );
                }}
                onClearSupport={() =>
                  void runAction(
                    setNeedsSupport(group.id, false, 'teacher'),
                    `${group.id}:support`
                  )
                }
              />
            ))}
          </ul>
        </div>
      }
    />
  );
};
