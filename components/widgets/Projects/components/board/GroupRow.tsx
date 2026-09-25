import React from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  ProjectGroup,
  ProjectStep,
  SubShareProjectGroupView,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useProjectGroupWork } from '@/hooks/useProjectGroupWork';
import { useProjectUploads } from '@/hooks/useProjectUploads';
import {
  STEP_STATE_LABELS,
  completedStepCount,
  stepStateOf,
} from '../../projectSteps';
import { STATE_STYLES } from '../../stepVisuals';
import { StateMark } from '../../StateMark';
import { cellKey, groupColorOf, stepsWithWork } from '../../boardHelpers';
import { GroupDetails } from './GroupDetails';

export type BoardGroup = SubShareProjectGroupView &
  Partial<Pick<ProjectGroup, 'memberUids' | 'workLinks'>>;

interface GroupRowProps {
  group: BoardGroup;
  steps: ProjectStep[];
  collapsed: boolean;
  dense: boolean;
  /** A substitute sees the tracker but cannot move it. */
  readOnly: boolean;
  /** The live run id; null in a sub share, which opens no listeners. */
  runId: string | null;
  /** D36 — open this row's work/upload listeners for dots even when not expanded. */
  watchWork: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  busyKeys: ReadonlySet<string>;
  openCellKey: string | null;
  onOpenCell: (groupId: string, stepId: string, anchor: HTMLElement) => void;
  stickyStyle: React.CSSProperties;
}

const CELL_PAD = 'min(3px, 0.8cqmin) min(3px, 0.8cqmin)';
const NAME_PAD =
  'min(3px, 0.8cqmin) min(8px, 1.8cqmin) min(3px, 0.8cqmin) min(12px, 2.6cqmin)';

export const GroupRow: React.FC<GroupRowProps> = ({
  group,
  steps,
  collapsed,
  dense,
  readOnly,
  runId,
  watchWork,
  expanded,
  onToggleExpand,
  busyKeys,
  openCellKey,
  onOpenCell,
  stickyStyle,
}) => {
  const { user } = useAuth();
  const listenRunId = runId && (watchWork || expanded) ? runId : null;
  const work = useProjectGroupWork(listenRunId, group.id, group.workLinks);
  const files = useProjectUploads(listenRunId, group.id, user?.uid, 'teacher');
  const withWork = listenRunId
    ? stepsWithWork(work.workLinks, files.uploads)
    : stepsWithWork(group.workLinks ?? [], []);

  const color = groupColorOf(group);
  const nameChip = (
    <span
      className="relative inline-flex min-w-0 max-w-full items-center overflow-hidden rounded-md"
      style={{ padding: 'min(2px, 0.5cqmin) min(7px, 1.6cqmin)' }}
    >
      <span aria-hidden className={`absolute inset-0 opacity-20 ${color}`} />
      <span
        className="relative truncate font-bold text-slate-900"
        style={{
          fontSize: dense ? 'min(13px, 3.8cqmin)' : 'min(15px, 4.6cqmin)',
        }}
      >
        {group.name}
      </span>
    </span>
  );

  const cellHeight = dense ? 'min(20px, 4.2cqmin)' : 'min(30px, 6.5cqmin)';

  return (
    <>
      <tr>
        <th
          scope="row"
          className="sticky left-0 z-[1] text-left align-middle font-normal"
          style={{ ...stickyStyle, padding: NAME_PAD }}
        >
          <span
            aria-hidden
            className={`absolute left-0 rounded-full ${color}`}
            style={{
              top: '12%',
              bottom: '12%',
              width: 'min(5px, 1.2cqmin)',
            }}
          />
          {readOnly || !runId ? (
            nameChip
          ) : (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              title={expanded ? 'Hide details' : 'Show members and work'}
              className="flex w-full min-w-0 items-center rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
              style={{ gap: 'min(3px, 0.8cqmin)' }}
            >
              {nameChip}
              <ChevronRight
                aria-hidden
                className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                style={{
                  width: 'min(14px, 3.4cqmin)',
                  height: 'min(14px, 3.4cqmin)',
                }}
              />
            </button>
          )}
        </th>

        {collapsed ? (
          <td style={{ padding: CELL_PAD }}>
            <span
              className="flex items-center"
              style={{ gap: 'min(8px, 1.8cqmin)' }}
            >
              <span
                className="flex flex-1 overflow-hidden rounded-md"
                style={{ gap: 'min(2px, 0.5cqmin)', height: cellHeight }}
              >
                {steps.map((step) => {
                  const state = stepStateOf(group, step.id);
                  return (
                    <span
                      key={step.id}
                      title={`${step.title}: ${STEP_STATE_LABELS[state]}`}
                      className={`flex-1 ${STATE_STYLES[state].tone}`}
                    />
                  );
                })}
              </span>
              <span
                className="shrink-0 font-semibold text-slate-600 tabular-nums"
                style={{ fontSize: 'min(12px, 3.4cqmin)' }}
              >
                {completedStepCount(group, steps)}/{steps.length}
              </span>
            </span>
          </td>
        ) : (
          steps.map((step) => {
            const state = stepStateOf(group, step.id);
            const key = cellKey(group.id, step.id);
            const hasWork = withWork.has(step.id);
            const review = state === 'readyForReview';
            const label = `${group.name}, ${step.title}, ${STEP_STATE_LABELS[state]}${hasWork ? ', work attached' : ''}`;
            const cell = `relative w-full flex items-center justify-center rounded-md ${STATE_STYLES[state].tone} ${
              review ? 'ring-2 ring-amber-700 ring-offset-1' : ''
            }`;
            const inner = (
              <>
                {!dense && (
                  <StateMark state={state} size="min(14px, 3.6cqmin)" />
                )}
                {hasWork && (
                  <span
                    aria-hidden
                    className="absolute rounded-full border border-white bg-slate-900"
                    style={{
                      top: 'min(2px, 0.5cqmin)',
                      right: 'min(2px, 0.5cqmin)',
                      width: 'min(7px, 1.8cqmin)',
                      height: 'min(7px, 1.8cqmin)',
                    }}
                  />
                )}
              </>
            );
            return (
              <td key={step.id} style={{ padding: CELL_PAD }}>
                {readOnly ? (
                  <span
                    aria-label={label}
                    className={cell}
                    style={{ height: cellHeight }}
                  >
                    {inner}
                  </span>
                ) : (
                  <button
                    type="button"
                    data-project-cell={key}
                    onClick={(e) =>
                      onOpenCell(group.id, step.id, e.currentTarget)
                    }
                    disabled={busyKeys.has(key)}
                    aria-label={label}
                    aria-haspopup="menu"
                    aria-expanded={openCellKey === key}
                    className={`${cell} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-50`}
                    style={{ height: cellHeight }}
                  >
                    {inner}
                  </button>
                )}
              </td>
            );
          })
        )}
      </tr>

      {expanded && runId && (
        <tr>
          <td
            colSpan={collapsed ? 2 : steps.length + 1}
            style={{
              padding: 'min(2px, 0.5cqmin) min(4px, 1cqmin) min(6px, 1.4cqmin)',
            }}
          >
            <GroupDetails
              runId={runId}
              groupId={group.id}
              classId={group.classId}
              memberUids={group.memberUids ?? []}
              steps={steps}
              workLinks={work.workLinks}
              uploads={files.uploads}
              workLoading={work.loading || files.loading}
            />
          </td>
        </tr>
      )}
    </>
  );
};
