// Screens 6a to 6c: Mentoring Program Hub, Workspace and Task tracker (T29 to T34).

import React, { useState } from 'react';
import { ArrowLeft, Eye, FileText, Megaphone, Plus } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { BarRows } from './charts/BarRows';
import { ChartLegend } from './charts/ChartTooltip';
import { DataTable } from './charts/DataTable';
import { CalendarEmbed } from './BuildingMock';
import { HeroHead } from './DepartmentHubMock';
import { PAIRS } from './fixtures';
import {
  ActionItem,
  Figure,
  INPUT,
  MenuSelect,
  META,
  PAGE,
  Row,
  RowList,
  Section,
  SectionHead,
  StatusLabel,
  TextLink,
  type StatusTone,
} from './ui';

interface Task {
  id: string;
  title: string;
  due: string;
  who: string;
  submitted: number;
  late: number;
  notStarted: number;
}

const TASKS: Task[] = [
  {
    id: 'goal',
    title: 'Goal-setting conference',
    due: 'Sep 30',
    who: 'Mentor and mentee',
    submitted: 12,
    late: 2,
    notStarted: 0,
  },
  {
    id: 'obs',
    title: 'Classroom observation reflection',
    due: 'Oct 24',
    who: 'Mentee',
    submitted: 3,
    late: 0,
    notStarted: 11,
  },
  {
    id: 'mid',
    title: 'Mid-year check-in',
    due: 'Jan 16',
    who: 'Mentor and mentee',
    submitted: 0,
    late: 0,
    notStarted: 14,
  },
];

const STATUS_BG = {
  submitted: 'bg-emerald-500',
  late: 'bg-amber-400',
  notStarted: 'bg-slate-300',
} as const;

export const MentoringHubMock: React.FC<{
  isLead: boolean;
  onLayout: () => void;
  onTracker: () => void;
  onWorkspace: () => void;
}> = ({ isLead, onLayout, onTracker, onWorkspace }) => {
  const next = TASKS[1];
  return (
    <div className={PAGE}>
      <Section first label="Next required task">
        <HeroHead
          eyebrow={`Next required task · due Fri, ${next.due}`}
          title={next.title}
          isLead={isLead}
          onChange={onLayout}
          meta={`Submits: ${next.who} · template doc in each workspace`}
          actions={
            isLead ? (
              <Button variant="secondary" size="sm" onClick={onTracker}>
                Open tracker
              </Button>
            ) : (
              <Button size="sm" onClick={onWorkspace}>
                Open in workspace
              </Button>
            )
          }
        />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
          After your mentor observes a lesson, write a one-page reflection: what
          you planned, what happened, and one change you will try. Share it with
          your mentor before you submit.
        </p>
        {!isLead && (
          <p className="mt-3 flex items-center gap-3">
            <StatusLabel tone="none">Not started</StatusLabel>
            <span className={META}>Your workspace with Dana Whitfield</span>
          </p>
        )}
      </Section>

      <Section label="Program">
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            {isLead ? (
              <>
                <SectionHead title="Submission status" meta="Pairs · 14 total">
                  <ChartLegend
                    items={[
                      { label: 'Submitted', swatch: STATUS_BG.submitted },
                      { label: 'Late', swatch: STATUS_BG.late },
                      { label: 'Not started', swatch: STATUS_BG.notStarted },
                    ]}
                  />
                </SectionHead>
                <BarRows
                  max={14}
                  ticks={[0, 7, 14]}
                  unit=""
                  columns="grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,12rem)]"
                  rows={TASKS.map((t) => ({
                    key: t.id,
                    label: (
                      <span className="block truncate" title={t.title}>
                        {t.title}
                      </span>
                    ),
                    segments: [
                      { value: t.submitted, bg: STATUS_BG.submitted },
                      { value: t.late, bg: STATUS_BG.late },
                      { value: t.notStarted, bg: STATUS_BG.notStarted },
                    ],
                    value: (
                      <span className="flex items-baseline gap-2">
                        <span className="shrink-0 text-sm font-bold tabular-nums text-slate-800">
                          {t.submitted} of 14
                        </span>
                        <span className="truncate">
                          due {t.due}
                          {t.late ? ` · ${t.late} late` : ''}
                        </span>
                      </span>
                    ),
                    ariaLabel: `${t.title}: ${t.submitted} submitted, ${t.late} late, ${t.notStarted} not started`,
                    tip: {
                      heading: `${t.title} · due ${t.due}`,
                      rows: [
                        {
                          value: String(t.submitted),
                          label: 'submitted',
                          swatch: STATUS_BG.submitted,
                        },
                        {
                          value: String(t.late),
                          label: 'late',
                          swatch: STATUS_BG.late,
                        },
                        {
                          value: String(t.notStarted),
                          label: 'not started',
                          swatch: STATUS_BG.notStarted,
                        },
                      ],
                    },
                  }))}
                />
              </>
            ) : (
              <>
                <SectionHead title="Your tasks" />
                <RowList>
                  {TASKS.map((t, i) => (
                    <Row
                      key={t.id}
                      title={t.title}
                      meta={`Due ${t.due} · ${t.who}`}
                      trailing={
                        i === 0 ? (
                          <StatusLabel tone="done">
                            Submitted Sep 29
                          </StatusLabel>
                        ) : (
                          <StatusLabel tone="none">Not started</StatusLabel>
                        )
                      }
                    />
                  ))}
                </RowList>
              </>
            )}
            <div className="mt-8">
              <SectionHead title="Latest updates">
                <TextLink>All updates</TextLink>
              </SectionHead>
              <RowList>
                {[
                  ['Observation window opens Oct 13', 'Laura Benson', 'Oct 6'],
                  ['Release-time sub codes for October', 'Tom Reyes', 'Oct 1'],
                  ['Kickoff slides and recording', 'Laura Benson', 'Sep 12'],
                ].map(([t, who, d]) => (
                  <Row
                    key={t}
                    icon={Megaphone}
                    title={t}
                    meta={who}
                    trailing={<span className={META}>{d}</span>}
                  />
                ))}
              </RowList>
            </div>
          </div>
          <div className="min-w-0">
            <SectionHead title="Program dates" />
            <CalendarEmbed
              name="Mentoring program"
              events={[
                ['Mon Oct 13', 'Observation window opens'],
                ['Fri Oct 24', 'Observation reflection due'],
                ['Wed Nov 5', 'Cohort session 2, 4:00 PM'],
                ['Fri Jan 16', 'Mid-year check-in due'],
              ]}
            />
            <div className="mt-8">
              <SectionHead title="Resources" />
              <ul className="divide-y divide-slate-100">
                {[
                  'Mentoring handbook',
                  'Observation protocol',
                  'Danielson framework summary',
                  'Sub request for release time',
                ].map((r) => (
                  <li key={r} className="py-2">
                    <TextLink className="text-sm">{r}</TextLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
};

export const WorkspaceMock: React.FC<{
  isLead: boolean;
  onBack: () => void;
}> = ({ isLead, onBack }) => (
  <div className="mx-auto w-full max-w-5xl px-6 pb-16">
    <Section first label="Workspace">
      {isLead && (
        <TextLink quiet icon={ArrowLeft} className="mb-2" onClick={onBack}>
          Workspaces
        </TextLink>
      )}
      <h2 className="text-xl font-extrabold text-slate-800">
        Dana Whitfield and Marcus Lee
      </h2>
      <p className={`${META} mt-1 flex items-center gap-1.5`}>
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        Program facilitators can view this workspace.
      </p>
    </Section>
    <Section label="Required tasks">
      <SectionHead title="Required tasks" />
      <DataTable
        head={['Task', 'Due', 'Submits', 'Status', '']}
        align={['left', 'left', 'left', 'left', 'right']}
        rows={[
          [
            <span key="t" className="font-semibold">
              Classroom observation reflection
            </span>,
            'Oct 24',
            'Mentee',
            <StatusLabel key="s" tone="none">
              Not started
            </StatusLabel>,
            <span key="a" className="inline-flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Open doc
              </Button>
              <Button size="sm">Submit</Button>
            </span>,
          ],
          [
            <span key="t" className="font-semibold">
              Goal-setting conference
            </span>,
            'Sep 30',
            'Both',
            <StatusLabel key="s" tone="done">
              Submitted Sep 29
            </StatusLabel>,
            <Button key="a" variant="ghost" size="sm">
              View
            </Button>,
          ],
          [
            <span key="t" className="font-semibold">
              Mid-year check-in
            </span>,
            'Jan 16',
            'Both',
            <StatusLabel key="s" tone="none">
              Not started
            </StatusLabel>,
            <Button
              key="a"
              variant="secondary"
              size="sm"
              icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Open doc
            </Button>,
          ],
        ]}
      />
    </Section>
    <Section label="Check-ins and docs">
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHead title="Check-ins">
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              New check-in
            </Button>
          </SectionHead>
          <RowList>
            {[
              ['Check-in Oct 6', 'Classroom routines, goal progress'],
              ['Check-in Sep 29', 'Goal-setting conference'],
              ['Check-in Sep 15', 'First weeks, parent emails'],
            ].map(([t, m]) => (
              <Row key={t} icon={FileText} title={t} meta={m} />
            ))}
          </RowList>
        </div>
        <div className="min-w-0">
          <SectionHead title="Action items" />
          <RowList>
            <ActionItem
              title="Try a 2-minute entry routine"
              meta="Marcus Lee · due Oct 10"
            />
            <ActionItem
              title="Share seating chart examples"
              meta="Dana Whitfield · due Oct 8"
            />
            <ActionItem
              title="Book observation date"
              meta="Marcus Lee · done Oct 6"
              done
            />
          </RowList>
          <div className="mt-8">
            <SectionHead title="Working docs">
              <TextLink icon={Plus}>Add a doc</TextLink>
            </SectionHead>
            <RowList>
              {[
                'Professional goals 2026-27',
                'Observation reflection (template)',
                'Parent communication log',
              ].map((d) => (
                <Row
                  key={d}
                  icon={FileText}
                  title={d}
                  trailing={<span className={META}>Google Doc</span>}
                />
              ))}
            </RowList>
          </div>
        </div>
      </div>
    </Section>
  </div>
);

export const TaskTrackerMock: React.FC<{ onWorkspace: () => void }> = ({
  onWorkspace,
}) => {
  const [taskId, setTaskId] = useState('goal');
  const task = TASKS.find((t) => t.id === taskId) ?? TASKS[0];
  const status = (i: number): [StatusTone, string] => {
    if (task.id === 'goal') {
      if (i >= 12) return ['warn', 'Late'];
      return [
        'done',
        i === 3
          ? 'Submitted Oct 2 · 2 days late'
          : `Submitted Sep ${24 + (i % 6)}`,
      ];
    }
    if (task.id === 'obs' && i < 3) return ['done', `Submitted Oct ${3 + i}`];
    return ['none', 'Not started'];
  };
  return (
    <div className={PAGE}>
      <Section first label="Workspaces">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-xl font-extrabold text-slate-800">
            Workspaces
          </h2>
          <Button
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Post a task
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            aria-label="Task"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className={`${INPUT} py-1.5`}
          >
            {TASKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <span className={META}>
            Due {task.due} · submits: {task.who}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-12 gap-y-4">
          <Figure
            value={task.submitted}
            label={<StatusLabel tone="done">Submitted</StatusLabel>}
          />
          <Figure
            value={task.late}
            label={<StatusLabel tone="warn">Late</StatusLabel>}
          />
          <Figure
            value={task.notStarted}
            label={<StatusLabel tone="none">Not started</StatusLabel>}
          />
        </div>
      </Section>
      <Section label="Pairs">
        <SectionHead title="Pairs">
          <MenuSelect
            label="Filter pairs"
            value="all"
            options={[
              { value: 'all', label: 'All pairs' },
              { value: 'late', label: 'Late' },
              { value: 'none', label: 'Not started' },
              { value: 'done', label: 'Submitted' },
            ]}
          />
        </SectionHead>
        <DataTable
          head={['Pair', 'Status', '']}
          align={['left', 'left', 'right']}
          rows={PAIRS.map(([mentor, mentee], i) => {
            const [tone, label] = status(i);
            return [
              <span key="p">
                <span className="font-semibold">{mentor}</span>{' '}
                <span className="text-slate-400">and</span>{' '}
                <span className="font-semibold">{mentee}</span>
              </span>,
              <StatusLabel key="s" tone={tone}>
                {label}
              </StatusLabel>,
              tone === 'done' ? (
                <TextLink key="a">Open submission</TextLink>
              ) : (
                <TextLink key="a" onClick={onWorkspace}>
                  Open workspace
                </TextLink>
              ),
            ];
          })}
        />
      </Section>
    </div>
  );
};
