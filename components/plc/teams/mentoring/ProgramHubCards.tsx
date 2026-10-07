// Program Hub cards (T34): submission status (facilitators), your tasks (mentors and mentees) and resources.

import React from 'react';
import { BarRows } from '@/components/plc/redesignMockup/charts/BarRows';
import { ChartLegend } from '@/components/plc/redesignMockup/charts/ChartTooltip';
import {
  Row,
  RowList,
  SectionHead,
  StatusLabel,
} from '@/components/plc/redesignMockup/ui';
import type { MentoringTask } from '@/types';
import type {
  MentoringPairStatus,
  MentoringTaskSummary,
} from '@/utils/mentoring';
import { ensureProtocol } from '@/utils/urlHelpers';
import { SUBMITTER_LABEL, pairStatusLabel, shortDate } from './mentoringFormat';

const STATUS_BG = {
  submitted: 'bg-emerald-500',
  late: 'bg-amber-400',
  notStarted: 'bg-slate-300',
} as const;

const tickFor = (total: number): number[] =>
  total > 1 ? [0, Math.round(total / 2), total] : [0, Math.max(1, total)];

export const SubmissionStatusView: React.FC<{
  summaries: MentoringTaskSummary[];
  total: number;
}> = ({ summaries, total }) => {
  const max = Math.max(1, total);
  return (
    <>
      <SectionHead title="Submission status" meta={`Pairs · ${total} total`}>
        <ChartLegend
          items={[
            { label: 'Submitted', swatch: STATUS_BG.submitted },
            { label: 'Late', swatch: STATUS_BG.late },
            { label: 'Not started', swatch: STATUS_BG.notStarted },
          ]}
        />
      </SectionHead>
      <BarRows
        max={max}
        ticks={tickFor(total)}
        unit=""
        columns="grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,12rem)]"
        rows={summaries.map(({ task: t, submitted, late, notStarted }) => {
          const due = shortDate(t.dueDate);
          return {
            key: t.id,
            label: (
              <span className="block truncate" title={t.title}>
                {t.title}
              </span>
            ),
            segments: [
              { value: submitted, bg: STATUS_BG.submitted },
              { value: late, bg: STATUS_BG.late },
              { value: notStarted, bg: STATUS_BG.notStarted },
            ],
            value: (
              <span className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="shrink-0 text-sm font-bold tabular-nums text-slate-800">
                  {submitted} of {total}
                </span>
                <span>
                  due {due}
                  {late ? ` · ${late} late` : ''}
                </span>
              </span>
            ),
            ariaLabel: `${t.title}: ${submitted} submitted, ${late} late, ${notStarted} not started`,
            tip: {
              heading: `${t.title} · due ${due}`,
              rows: [
                {
                  value: String(submitted),
                  label: 'submitted',
                  swatch: STATUS_BG.submitted,
                },
                { value: String(late), label: 'late', swatch: STATUS_BG.late },
                {
                  value: String(notStarted),
                  label: 'not started',
                  swatch: STATUS_BG.notStarted,
                },
              ],
            },
          };
        })}
      />
    </>
  );
};

export const YourTasksView: React.FC<{
  rows: { task: MentoringTask; status: MentoringPairStatus }[];
}> = ({ rows }) => (
  <>
    <SectionHead title="Your tasks" />
    <RowList>
      {rows.map(({ task, status }) => {
        const [tone, label] = pairStatusLabel(status);
        return (
          <Row
            key={task.id}
            title={task.title}
            meta={`Due ${shortDate(task.dueDate)} · ${SUBMITTER_LABEL[task.submitter]}`}
            trailing={<StatusLabel tone={tone}>{label}</StatusLabel>}
          />
        );
      })}
    </RowList>
  </>
);

export const ResourcesListView: React.FC<{
  links: { id: string; title: string; url: string }[];
}> = ({ links }) => (
  <>
    <SectionHead title="Resources" />
    <ul className="divide-y divide-slate-100">
      {links.map((r) => (
        <li key={r.id} className="py-2">
          <a
            href={ensureProtocol(r.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded text-xs font-semibold text-brand-blue-primary transition-colors hover:text-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
          >
            {r.title}
          </a>
        </li>
      ))}
    </ul>
  </>
);
