import React, { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChevronLeft,
  ClipboardList,
  Ellipsis,
  Flag,
  Hand,
  Loader2,
  SquarePen,
  Users,
} from 'lucide-react';
import type {
  ProjectStep,
  ProjectStepState,
  ProjectsConfig,
  SubShareProjectGroupView,
  WidgetData,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useProjectRun } from '@/hooks/useProjectRun';
import { useSubShareProject } from '../useSubShareProject';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { ActiveClassChip } from '@/components/common/ActiveClassChip';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';
import { getFontClass, hexToRgba } from '@/utils/styles';
import {
  COMFORTABLE_GROUPS,
  COMFORTABLE_STEPS,
  STEP_STATE_LABELS,
  STEP_STATE_ORDER,
  completedStepCount,
  groupsForClass,
  projectClassIdFor,
  sortGroupsForBoard,
  stepStateOf,
  studentStateOptions,
} from '../projectSteps';

/** Purposeful colour, one hue per state, each with a mark so colour is never the only cue. */
const STATE_STYLES: Record<
  ProjectStepState,
  { tone: string; Mark: LucideIcon | null }
> = {
  notStarted: { tone: 'bg-slate-300/70', Mark: null },
  inProgress: { tone: 'bg-brand-blue-primary text-white', Mark: Ellipsis },
  readyForReview: { tone: 'bg-amber-400 text-amber-950', Mark: Flag },
  done: { tone: 'bg-emerald-600 text-white', Mark: Check },
};

const StateMark: React.FC<{ state: ProjectStepState; size: string }> = ({
  state,
  size,
}) => {
  const Mark = STATE_STYLES[state].Mark;
  if (!Mark) return null;
  return <Mark aria-hidden style={{ width: size, height: size }} />;
};

const nextState = (
  step: ProjectStep,
  current: ProjectStepState
): ProjectStepState => {
  // D28 — the approval ceiling is the student's; the teacher cycles past it.
  const options: ProjectStepState[] = studentStateOptions(step).concat(
    step.requiresApproval ? ['done'] : []
  );
  return options[(options.indexOf(current) + 1) % options.length];
};

const CELL_PAD_Y = 'min(3px, 0.8cqmin)';
const CELL_PAD_X = 'min(4px, 1cqmin)';
const HEADER_PAD_Y = 'min(4px, 1cqmin)';
const NAME_PAD_X = 'min(10px, 2.2cqmin)';

const GroupRow: React.FC<{
  group: SubShareProjectGroupView;
  steps: ProjectStep[];
  showStatus: boolean;
  /** A substitute sees the tracker but cannot move it. */
  readOnly: boolean;
  busyKeys: ReadonlySet<string>;
  onCycleStep: (stepId: string, state: ProjectStepState) => void;
  onClearSupport: () => void;
}> = ({
  group,
  steps,
  showStatus,
  readOnly,
  busyKeys,
  onCycleStep,
  onClearSupport,
}) => (
  <tr>
    <th
      scope="row"
      className="text-left align-middle font-normal"
      style={{ padding: `${CELL_PAD_Y} ${NAME_PAD_X}` }}
    >
      <span
        className="flex flex-wrap items-center min-w-0"
        style={{ gap: 'min(6px, 1.4cqmin)' }}
      >
        <span
          className="font-bold text-slate-800 truncate"
          style={{
            fontSize: 'min(15px, 5cqmin)',
            minWidth: 'min(96px, 24cqmin)',
          }}
        >
          {group.name}
        </span>
        {group.needsSupport &&
          (readOnly ? (
            <span
              className="shrink-0 flex items-center rounded-full bg-amber-100 text-amber-800 font-semibold"
              style={{
                gap: 'min(4px, 1cqmin)',
                padding: 'min(3px, 0.7cqmin) min(8px, 1.8cqmin)',
                fontSize: 'min(12px, 3.6cqmin)',
              }}
            >
              <Hand
                aria-hidden
                style={{
                  width: 'min(13px, 3.4cqmin)',
                  height: 'min(13px, 3.4cqmin)',
                }}
              />
              Help
            </span>
          ) : (
            <button
              type="button"
              onClick={onClearSupport}
              disabled={busyKeys.has(`${group.id}:support`)}
              className="shrink-0 flex items-center rounded-full bg-amber-100 text-amber-800 font-semibold disabled:opacity-50"
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
          ))}
      </span>
    </th>

    {showStatus ? (
      steps.map((step) => {
        const state = stepStateOf(group, step.id);
        const label = `${group.name}, ${step.title}, ${STEP_STATE_LABELS[state]}`;
        const cell = `w-full h-full flex items-center justify-center rounded-md ${STATE_STYLES[state].tone}`;
        return (
          <td key={step.id} style={{ padding: `${CELL_PAD_Y} ${CELL_PAD_X}` }}>
            {readOnly ? (
              <span
                aria-label={label}
                className={cell}
                style={{
                  minHeight: 'min(26px, 6cqmin)',
                  maxHeight: 'min(56px, 13cqmin)',
                }}
              >
                <StateMark state={state} size="min(14px, 3.6cqmin)" />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onCycleStep(step.id, state)}
                disabled={busyKeys.has(`${group.id}:${step.id}`)}
                aria-label={label}
                className={`${cell} transition-colors disabled:opacity-50`}
                style={{
                  minHeight: 'min(26px, 6cqmin)',
                  maxHeight: 'min(56px, 13cqmin)',
                }}
              >
                <StateMark state={state} size="min(14px, 3.6cqmin)" />
              </button>
            )}
          </td>
        );
      })
    ) : (
      <td
        className="text-slate-500 font-medium"
        style={{
          padding: `${CELL_PAD_Y} ${CELL_PAD_X}`,
          fontSize: 'min(13px, 4.2cqmin)',
        }}
      >
        {completedStepCount(group, steps)} of {steps.length} done
      </td>
    )}
  </tr>
);

interface ProjectBoardViewProps {
  widget: WidgetData;
  projectId: string;
  onBackToLibrary: () => void;
  onGrade: () => void;
  onManageGroups: () => void;
}

/** The projected tracker (D25–D30), now one view of the widget rather than its whole face. */
export const ProjectBoardView: React.FC<ProjectBoardViewProps> = ({
  widget,
  projectId,
  onBackToLibrary,
  onGrade,
  onManageGroups,
}) => {
  const config = widget.config as ProjectsConfig;
  const {
    showStatus = true,
    fontFamily,
    cardColor = '#ffffff',
    cardOpacity = 0.75,
  } = config;

  const { updateWidget, rosters, activeRosterId, addToast, activeDashboard } =
    useDashboard();
  const { user } = useAuth();
  const shared = useSubShareProject(projectId);
  const readOnly = shared.active;
  // A substitute can read neither the project nor its run, so in a share the
  // bundled copy stands in and no listener is opened against either.
  const live = useProjectRun(
    user?.uid,
    readOnly ? undefined : projectId,
    user?.uid
  );
  const { setStepState, setNeedsSupport } = live;
  const run = readOnly ? shared.run : live.run;
  const groups = readOnly ? shared.groups : live.groups;
  const loading = readOnly ? shared.loading : live.loading;

  // A set, not a scalar: two rows can be in flight at once and each owns its key.
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );

  const activeClassId = useMemo(
    () => projectClassIdFor(rosters.find((r) => r.id === activeRosterId)),
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
    setBusyKeys((keys) => new Set(keys).add(key));
    try {
      await action;
    } catch {
      addToast('That change could not be saved.', 'error');
    } finally {
      setBusyKeys((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
    }
  };

  const backButton = (
    <button
      type="button"
      onClick={onBackToLibrary}
      className="shrink-0 inline-flex items-center rounded-full bg-white/70 border border-slate-200 text-slate-600 font-semibold"
      style={{
        gap: 'min(3px, 0.8cqmin)',
        padding: 'min(4px, 0.9cqmin) min(9px, 2cqmin)',
        fontSize: 'min(12px, 3.6cqmin)',
      }}
      aria-label="Back to the project library"
    >
      <ChevronLeft
        aria-hidden
        style={{ width: 'min(13px, 3.4cqmin)', height: 'min(13px, 3.4cqmin)' }}
      />
      Library
    </button>
  );

  const framed = (body: React.ReactNode): React.ReactElement => (
    <div
      className="h-full w-full bg-transparent flex flex-col"
      style={{ gap: 'min(8px, 1.8cqmin)', padding: 'min(12px, 2.6cqmin)' }}
    >
      {!readOnly && <div className="shrink-0">{backButton}</div>}
      <div className="flex-1 min-h-0">{body}</div>
    </div>
  );

  if (loading) {
    return framed(
      <div className="h-full w-full flex items-center justify-center">
        <Loader2
          aria-label="Loading this project"
          className="animate-spin text-slate-300"
          style={{ width: 'min(32px, 12cqmin)', height: 'min(32px, 12cqmin)' }}
        />
      </div>
    );
  }

  if (!run) {
    return framed(
      <ScaledEmptyState
        icon={ClipboardList}
        title="Not started yet"
        subtitle={
          readOnly
            ? 'This project had no groups yet when it was shared.'
            : 'Set up groups from the Library tab to start this project.'
        }
      />
    );
  }

  if (!activeClassId) {
    return framed(
      <ScaledEmptyState
        icon={ClipboardList}
        title="Pick a class"
        subtitle="This board shows the groups in whichever class is active."
      />
    );
  }

  if (visibleGroups.length === 0) {
    return framed(
      <ScaledEmptyState
        icon={ClipboardList}
        title="No groups in this class"
        subtitle={
          readOnly
            ? 'This project runs with another class.'
            : 'Make groups for this class to start tracking it.'
        }
        action={
          readOnly ? undefined : (
            <button
              type="button"
              onClick={onManageGroups}
              className="inline-flex items-center rounded-full bg-brand-blue-primary font-bold text-white"
              style={{
                gap: 'min(4px, 1cqmin)',
                padding: 'min(6px, 1.4cqmin) min(12px, 2.8cqmin)',
                fontSize: 'min(13px, 4cqmin)',
              }}
            >
              <Users
                aria-hidden
                style={{
                  width: 'min(14px, 3.8cqmin)',
                  height: 'min(14px, 3.8cqmin)',
                }}
              />
              Manage groups
            </button>
          )
        }
      />
    );
  }

  // D26 — past the ceiling, counts beat cells drawn too small to read.
  const tooDenseToDraw =
    visibleGroups.length > COMFORTABLE_GROUPS ||
    steps.length > COMFORTABLE_STEPS;
  const renderStatus = showStatus && !tooDenseToDraw;

  return (
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
        <div
          className="flex items-center min-w-0"
          style={{ gap: 'min(6px, 1.4cqmin)' }}
        >
          {!readOnly && backButton}
          <span
            className="font-black text-slate-800 truncate"
            style={{ fontSize: 'min(18px, 6cqmin)' }}
          >
            {run.title}
          </span>
        </div>
        <div
          className="flex items-center shrink-0"
          style={{ gap: 'min(6px, 1.4cqmin)' }}
        >
          <ActiveClassChip compact />
          {/* Every control here writes the teacher's board or their run. */}
          {!readOnly && (
            <>
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
              <OverflowMenu
                ariaLabel="Project actions"
                items={[
                  { label: 'Grade groups', icon: SquarePen, onClick: onGrade },
                  {
                    label: 'Manage groups',
                    icon: Users,
                    onClick: onManageGroups,
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {tooDenseToDraw && showStatus && (
        <p
          className="shrink-0 text-slate-500"
          style={{ fontSize: 'min(11px, 3.4cqmin)' }}
        >
          Showing counts.
        </p>
      )}

      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-xl"
        style={{
          ...cardStyle,
          padding: 'min(6px, 1.4cqmin) min(4px, 1cqmin) min(8px, 1.8cqmin)',
        }}
      >
        <table
          className="w-full h-full table-fixed border-separate"
          style={{ borderSpacing: 0 }}
        >
          <caption className="sr-only">
            {run.title} — each group&apos;s progress through every step
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 text-left"
                style={{
                  ...cardStyle,
                  width: '34%',
                  padding: `${HEADER_PAD_Y} ${NAME_PAD_X}`,
                }}
              >
                <span className="sr-only">Group</span>
              </th>
              {renderStatus ? (
                steps.map((step) => (
                  <th
                    key={step.id}
                    scope="col"
                    title={step.title}
                    className="sticky top-0 align-bottom text-center font-semibold text-slate-600"
                    style={{
                      ...cardStyle,
                      padding: `${HEADER_PAD_Y} ${CELL_PAD_X}`,
                      fontSize: 'min(11px, 3.4cqmin)',
                    }}
                  >
                    <span className="block leading-tight break-words line-clamp-2">
                      {step.title}
                    </span>
                  </th>
                ))
              ) : (
                <th
                  scope="col"
                  className="sticky top-0"
                  style={{
                    ...cardStyle,
                    padding: `${HEADER_PAD_Y} ${CELL_PAD_X}`,
                  }}
                >
                  <span className="sr-only">Progress</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                steps={steps}
                showStatus={renderStatus}
                readOnly={readOnly}
                busyKeys={busyKeys}
                onCycleStep={(stepId, state) => {
                  const step = steps.find((s) => s.id === stepId);
                  if (!step) return;
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
          </tbody>
        </table>
      </div>

      {renderStatus && (
        <div
          className="shrink-0 flex flex-wrap items-center text-slate-600"
          style={{
            gap: 'min(10px, 2.2cqmin)',
            fontSize: 'min(11px, 3.4cqmin)',
          }}
        >
          {STEP_STATE_ORDER.map((state) => (
            <span
              key={state}
              className="flex items-center"
              style={{ gap: 'min(4px, 1cqmin)' }}
            >
              <span
                aria-hidden
                className={`flex items-center justify-center rounded ${STATE_STYLES[state].tone}`}
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              >
                <StateMark state={state} size="min(10px, 2.6cqmin)" />
              </span>
              {STEP_STATE_LABELS[state]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
