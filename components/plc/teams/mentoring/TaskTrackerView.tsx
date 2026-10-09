// Facilitators' Workspaces page (T30, T32): the per-task tracker and every pair's workspace.

import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { DataTable } from '@/components/plc/redesignMockup/charts/DataTable';
import {
  Figure,
  INPUT,
  META,
  MenuSelect,
  PAGE,
  Section,
  SectionHead,
  StatusLabel,
  TextLink,
  type StatusTone,
} from '@/components/plc/redesignMockup/ui';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export type TrackerFilter = 'all' | 'late' | 'none' | 'done';

export interface TrackerPairRow {
  id: string;
  mentor: string;
  mentee: string;
  tone: StatusTone;
  status: string;
}

export interface TaskTrackerViewProps {
  tasks: { id: string; title: string }[];
  taskId: string | null;
  onTask: (id: string) => void;
  /** "Due Sep 30 · submits: Mentor and mentee". */
  taskMeta: string;
  counts: { submitted: number; late: number; notStarted: number } | null;
  filter: TrackerFilter;
  onFilter: (f: TrackerFilter) => void;
  pairs: TrackerPairRow[];
  onPostTask?: () => void;
  onOpenSubmission: (workspaceId: string) => void;
  onOpenWorkspace: (workspaceId: string) => void;
}

const TONE_FOR: Record<Exclude<TrackerFilter, 'all'>, StatusTone> = {
  late: 'warn',
  none: 'none',
  done: 'done',
};

export const TaskTrackerView: React.FC<TaskTrackerViewProps> = ({
  tasks,
  taskId,
  onTask,
  taskMeta,
  counts,
  filter,
  onFilter,
  pairs,
  onPostTask,
  onOpenSubmission,
  onOpenWorkspace,
}) => {
  const shown =
    filter === 'all' || !counts
      ? pairs
      : pairs.filter((p) => p.tone === TONE_FOR[filter]);
  return (
    <div className={PAGE}>
      <Section first label="Workspaces">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-xl font-extrabold text-slate-800">
            Workspaces
          </h2>
          {onPostTask && (
            <Button
              size="sm"
              {...tourAttr('teams.mentoring.post-task')}
              onClick={onPostTask}
              icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Post a task
            </Button>
          )}
        </div>
        {tasks.length > 0 && taskId && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select
              aria-label="Task"
              {...tourAttr('teams.tracker.task')}
              value={taskId}
              onChange={(e) => onTask(e.target.value)}
              className={`${INPUT} py-1.5`}
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <span className={META}>{taskMeta}</span>
          </div>
        )}
        {counts && (
          <div className="mt-5 flex flex-wrap gap-x-12 gap-y-4">
            <Figure
              value={counts.submitted}
              label={<StatusLabel tone="done">Submitted</StatusLabel>}
            />
            <Figure
              value={counts.late}
              label={<StatusLabel tone="warn">Late</StatusLabel>}
            />
            <Figure
              value={counts.notStarted}
              label={<StatusLabel tone="none">Not started</StatusLabel>}
            />
          </div>
        )}
      </Section>
      <Section label="Pairs">
        <SectionHead title="Pairs">
          {counts && (
            <MenuSelect
              label="Filter pairs"
              anchor={tourAttr('teams.tracker.filter')}
              value={filter}
              onChange={(v) => onFilter(v as TrackerFilter)}
              options={[
                { value: 'all', label: 'All pairs' },
                { value: 'late', label: 'Late' },
                { value: 'none', label: 'Not started' },
                { value: 'done', label: 'Submitted' },
              ]}
            />
          )}
        </SectionHead>
        <DataTable
          head={counts ? ['Pair', 'Status', ''] : ['Pair', '']}
          align={counts ? ['left', 'left', 'right'] : ['left', 'right']}
          rows={shown.map((p) => {
            const name = (
              <span key="p">
                <span className="font-semibold">{p.mentor}</span>{' '}
                <span className="text-slate-400">and</span>{' '}
                <span className="font-semibold">{p.mentee}</span>
              </span>
            );
            const action =
              counts && p.tone === 'done' ? (
                <TextLink
                  key="a"
                  onClick={() => onOpenSubmission(p.id)}
                  {...tourFieldAttr(
                    'teams.tracker.open-submission',
                    'teams-mentoring',
                    p.id
                  )}
                >
                  Open submission
                </TextLink>
              ) : (
                <TextLink
                  key="a"
                  onClick={() => onOpenWorkspace(p.id)}
                  {...tourFieldAttr(
                    'teams.tracker.open-workspace',
                    'teams-mentoring',
                    p.id
                  )}
                >
                  Open workspace
                </TextLink>
              );
            return counts
              ? [
                  name,
                  <StatusLabel key="s" tone={p.tone}>
                    {p.status}
                  </StatusLabel>,
                  action,
                ]
              : [name, action];
          })}
        />
      </Section>
    </div>
  );
};
