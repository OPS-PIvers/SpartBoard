import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ClipboardList,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  SquarePen,
  Users,
} from 'lucide-react';
import type { ProjectStepState, ProjectsConfig, WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useProjectRun } from '@/hooks/useProjectRun';
import { tourAttr } from '@/config/tourAnchors';
import { useSubShareProject } from '../useSubShareProject';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';
import { getFontClass, hexToRgba } from '@/utils/styles';
import {
  NO_STUDENT_SIGN_IN_WARNING,
  STEP_STATE_LABELS,
  STEP_STATE_ORDER,
  groupsForClass,
  rosterHasStudentSignIn,
  sortGroupsForBoard,
  stepStateOf,
} from '../projectSteps';
import {
  DENSE_GROUPS,
  DENSE_STEPS,
  DOT_GROUP_LIMIT,
  boardClassIds,
  boardClassOptions,
  cellKey,
  resolveBoardClassId,
  reviewCells,
  rosterForClass,
} from '../boardHelpers';
import { STATE_STYLES } from '../stepVisuals';
import { StateMark } from '../StateMark';
import { BoardClassPicker } from './board/BoardClassPicker';
import { GroupRow, type BoardGroup } from './board/GroupRow';
import { StatusPopover } from './board/StatusPopover';

const HEADER_PAD = 'min(4px, 1cqmin) min(3px, 0.8cqmin)';

interface ProjectBoardViewProps {
  widget: WidgetData;
  projectId: string;
  onBackToLibrary: () => void;
  onGrade: () => void;
  onManageGroups: () => void;
}

interface OpenCell {
  groupId: string;
  stepId: string;
  anchor: HTMLElement;
}

/** The projected tracker (D31–D37): always a grid, one row per group, one column per step. */
export const ProjectBoardView: React.FC<ProjectBoardViewProps> = ({
  widget,
  projectId,
  onBackToLibrary,
  onGrade,
  onManageGroups,
}) => {
  const config = widget.config as ProjectsConfig;
  const { fontFamily, cardColor = '#ffffff', cardOpacity = 0.75 } = config;
  const collapsed = config.boardCollapsed ?? config.showStatus === false;

  const { updateWidget, rosters, addToast, activeDashboard } = useDashboard();
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
  const { setStepState, setPeerVisibility } = live;
  const run = readOnly ? shared.run : live.run;
  const groups: BoardGroup[] = readOnly ? shared.groups : live.groups;
  const loading = readOnly ? shared.loading : live.loading;
  const peersVisible = live.run?.showStatusToStudents === true;
  const liveRunId = readOnly ? null : (live.run?.id ?? null);

  // A set, not a scalar: two cells can be in flight at once and each owns its key.
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  // A substitute can pick a class but must not write the teacher's board.
  const [localClassId, setLocalClassId] = useState<string | null>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const classIds = useMemo(
    () => boardClassIds(readOnly ? null : live.run, groups),
    [groups, live.run, readOnly]
  );
  const classOptions = useMemo(
    () => boardClassOptions(classIds, run?.classNames, rosters),
    [classIds, rosters, run?.classNames]
  );
  const selectedClassId = resolveBoardClassId(
    readOnly ? (localClassId ?? config.boardClassId) : config.boardClassId,
    classIds
  );
  const selectedRoster = rosterForClass(rosters, selectedClassId);
  // Skipped when no roster is loaded (a sub share): no roster, nothing to judge.
  const noSignIn =
    !readOnly &&
    !!selectedRoster &&
    Array.isArray(selectedRoster.students) &&
    !rosterHasStudentSignIn(selectedRoster);

  const visibleGroups = useMemo(
    () => sortGroupsForBoard(groupsForClass(groups, selectedClassId)),
    [groups, selectedClassId]
  );

  const steps = useMemo(() => run?.steps ?? [], [run?.steps]);
  const waiting = useMemo(
    () => reviewCells(visibleGroups, steps),
    [steps, visibleGroups]
  );
  const dense =
    visibleGroups.length > DENSE_GROUPS || steps.length > DENSE_STEPS;
  const watchAllWork = !readOnly && visibleGroups.length <= DOT_GROUP_LIMIT;

  const cardStyle = { backgroundColor: hexToRgba(cardColor, cardOpacity) };
  // Sticky cells sit over scrolled content, so they need a near-opaque fill.
  const stickyStyle = {
    backgroundColor: hexToRgba(cardColor, Math.max(cardOpacity, 0.94)),
  };
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

  const closePopover = useCallback(() => setOpenCell(null), []);

  const openCellAt = (groupId: string, stepId: string, anchor: HTMLElement) =>
    setOpenCell((current) =>
      current?.groupId === groupId && current.stepId === stepId
        ? null
        : { groupId, stepId, anchor }
    );

  const openFirstReview = () => {
    const first = waiting[0];
    if (!first) return;
    const cell = gridRef.current?.querySelector<HTMLElement>(
      `[data-project-cell="${cellKey(first.groupId, first.stepId)}"]`
    );
    setOpenCell({
      ...first,
      anchor: cell ?? reviewButtonRef.current ?? document.body,
    });
  };

  const pickClass = (classId: string) => {
    setExpandedGroupId(null);
    setOpenCell(null);
    if (readOnly) setLocalClassId(classId);
    else
      updateWidget(widget.id, { config: { ...config, boardClassId: classId } });
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

  const manageGroupsButton = (
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
        style={{ width: 'min(14px, 3.8cqmin)', height: 'min(14px, 3.8cqmin)' }}
      />
      Manage groups
    </button>
  );

  const openGroup = openCell
    ? visibleGroups.find((g) => g.id === openCell.groupId)
    : undefined;
  const openStep = openCell
    ? steps.find((s) => s.id === openCell.stepId)
    : undefined;

  const body =
    visibleGroups.length === 0 ? (
      <ScaledEmptyState
        icon={ClipboardList}
        title={
          classIds.length === 0 ? 'No groups yet' : 'No groups in this class'
        }
        subtitle={
          readOnly
            ? 'This project runs with another class.'
            : 'Make groups for this class to start tracking it.'
        }
        action={readOnly ? undefined : manageGroupsButton}
      />
    ) : (
      <div
        ref={gridRef}
        {...tourAttr('projects.board-grid', widget.id, 'projects')}
        className="h-full overflow-auto rounded-xl"
        style={{
          ...cardStyle,
          padding: 'min(4px, 1cqmin) min(4px, 1cqmin) min(6px, 1.4cqmin) 0',
        }}
      >
        <table
          className="w-full h-full table-fixed border-separate"
          style={{
            borderSpacing: 0,
            // Scroll only when cells would fall below a tappable minimum.
            minWidth: collapsed
              ? '220px'
              : `calc(96px + ${steps.length} * 20px)`,
          }}
        >
          <caption className="sr-only">
            {`${run.title}: each group's progress through every step`}
          </caption>
          <colgroup>
            <col style={{ width: collapsed ? '32%' : dense ? '22%' : '28%' }} />
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-[3] text-left"
                style={{ ...stickyStyle, padding: HEADER_PAD }}
              >
                <span className="sr-only">Group</span>
              </th>
              {collapsed ? (
                <th
                  scope="col"
                  className="sticky top-0 z-[2]"
                  style={{ ...stickyStyle, padding: HEADER_PAD }}
                >
                  <span className="sr-only">Progress</span>
                </th>
              ) : (
                steps.map((step) => (
                  <th
                    key={step.id}
                    scope="col"
                    title={step.title}
                    className="sticky top-0 z-[2] align-bottom text-center font-semibold text-slate-600"
                    style={{
                      ...stickyStyle,
                      padding: HEADER_PAD,
                      fontSize: dense
                        ? 'min(10px, 2.8cqmin)'
                        : 'min(11px, 3.2cqmin)',
                    }}
                  >
                    <span
                      className={`block leading-tight ${
                        dense ? 'truncate' : 'break-words line-clamp-2'
                      }`}
                    >
                      {step.title}
                    </span>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                steps={steps}
                collapsed={collapsed}
                dense={dense}
                readOnly={readOnly}
                runId={liveRunId}
                watchWork={watchAllWork}
                expanded={expandedGroupId === group.id}
                onToggleExpand={() =>
                  setExpandedGroupId((id) =>
                    id === group.id ? null : group.id
                  )
                }
                busyKeys={busyKeys}
                openCellKey={
                  openCell ? cellKey(openCell.groupId, openCell.stepId) : null
                }
                onOpenCell={openCellAt}
                stickyStyle={stickyStyle}
              />
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div
      className={`h-full w-full bg-transparent flex flex-col ${fontClassName}`}
      style={{
        gap: 'min(6px, 1.4cqmin)',
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
            title={run.title}
            style={{ fontSize: 'min(18px, 5.4cqmin)' }}
          >
            {run.title}
          </span>
        </div>
        <div
          className="flex items-center min-w-0"
          style={{ gap: 'min(6px, 1.4cqmin)' }}
        >
          {waiting.length > 0 && !readOnly && (
            <button
              ref={reviewButtonRef}
              type="button"
              onClick={openFirstReview}
              className="shrink-0 inline-flex items-center rounded-full bg-amber-400 font-bold text-amber-950"
              style={{
                gap: 'min(4px, 1cqmin)',
                padding: 'min(4px, 0.9cqmin) min(9px, 2cqmin)',
                fontSize: 'min(12px, 3.6cqmin)',
              }}
            >
              <Flag
                aria-hidden
                style={{
                  width: 'min(12px, 3.2cqmin)',
                  height: 'min(12px, 3.2cqmin)',
                }}
              />
              {waiting.length} waiting for review
            </button>
          )}
          {classOptions.length > 0 && (
            <BoardClassPicker
              widgetId={widget.id}
              options={classOptions}
              value={selectedClassId}
              onChange={pickClass}
            />
          )}
          {/* Every control here writes the teacher's board or their run. */}
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpenCell(null);
                  updateWidget(widget.id, {
                    config: { ...config, boardCollapsed: !collapsed },
                  });
                }}
                className="shrink-0 rounded-full bg-white/70 border border-slate-200 text-slate-600 font-semibold"
                style={{
                  padding: 'min(4px, 0.9cqmin) min(10px, 2.2cqmin)',
                  fontSize: 'min(12px, 3.6cqmin)',
                }}
                aria-label={collapsed ? 'Show as grid' : 'Show as bars'}
                title={collapsed ? 'Show every step' : 'One bar per group'}
              >
                {collapsed ? 'Grid' : 'Bars'}
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
                  {
                    id: 'peer-visibility',
                    label: peersVisible
                      ? 'Students see other groups: on'
                      : 'Students see other groups: off',
                    icon: peersVisible ? Eye : EyeOff,
                    disabled: busyKeys.has('peer-visibility'),
                    onClick: () =>
                      void runAction(
                        setPeerVisibility(!peersVisible),
                        'peer-visibility'
                      ),
                  },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {noSignIn && (
        <p
          className="shrink-0 flex items-center text-amber-800"
          title={NO_STUDENT_SIGN_IN_WARNING}
          style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(11px, 3.2cqmin)' }}
        >
          <AlertTriangle
            aria-hidden
            className="shrink-0"
            style={{
              width: 'min(12px, 3.2cqmin)',
              height: 'min(12px, 3.2cqmin)',
            }}
          />
          <span className="truncate">{NO_STUDENT_SIGN_IN_WARNING}</span>
        </p>
      )}

      <div className="flex-1 min-h-0">{body}</div>

      {visibleGroups.length > 0 && (
        <div
          className="shrink-0 flex flex-wrap items-center text-slate-600"
          style={{
            gap: 'min(10px, 2.2cqmin)',
            fontSize: 'min(11px, 3.2cqmin)',
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

      {openCell && openGroup && openStep && !readOnly && (
        <StatusPopover
          widgetId={widget.id}
          anchor={openCell.anchor}
          title={`${openGroup.name}: ${openStep.title}`}
          current={stepStateOf(openGroup, openStep.id)}
          onClose={closePopover}
          onPick={(state: ProjectStepState) =>
            void runAction(
              setStepState(openGroup.id, openStep.id, state, 'teacher'),
              cellKey(openGroup.id, openStep.id)
            )
          }
        />
      )}
    </div>
  );
};
