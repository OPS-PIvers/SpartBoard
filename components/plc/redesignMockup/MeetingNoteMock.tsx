// Screen 8: a PLC meeting note from the team template, with live Data and Decision blocks (T11 to T15).

import React, { useMemo } from 'react';
import {
  BarChart3,
  ChevronDown,
  FileText,
  Link2,
  Mic,
  MoreHorizontal,
  Plus,
  Scale,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import {
  ItemAnalysisChart,
  ItemAnalysisLegend,
} from './charts/ItemAnalysisChart';
import { plcOverviewData } from './fixtures';
import { ActionItem, EYEBROW, META, RowList, TextLink } from './ui';

const NOTES: [string, string, boolean?][] = [
  ['PLC meeting Oct 9', 'Today', true],
  ['Unit 3 reteach plan', 'Doc · Sep 30'],
  ['PLC meeting Oct 2', 'Oct 2'],
  ['PLC meeting Sep 25', 'Sep 25'],
];

const NoteListItem: React.FC<{
  title: string;
  meta: string;
  active?: boolean;
  icon?: boolean;
}> = ({ title, meta, active = false, icon = false }) => (
  <button
    type="button"
    aria-current={active || undefined}
    className={`flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors ${
      active ? 'bg-brand-blue-lighter' : 'hover:bg-slate-100'
    }`}
  >
    <span className="flex items-center gap-1.5 truncate text-xs font-bold text-slate-800">
      {icon && (
        <FileText
          className="h-3 w-3 shrink-0 text-slate-400"
          aria-hidden="true"
        />
      )}
      {title}
    </span>
    <span className="mt-0.5 truncate text-xxs text-slate-500">{meta}</span>
  </button>
);

const NoteHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 mt-7 text-base font-bold text-slate-800">{children}</h3>
);

export const MeetingNoteMock: React.FC<{ onData: () => void }> = ({
  onData,
}) => {
  const data = useMemo(() => plcOverviewData(true), []);
  const ia = data.itemAnalysis;
  const lowest = ia.questions.slice(0, 3);
  const q5 = ia.questions.find((q) => q.number === 5);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Button
            size="sm"
            className="flex-1"
            icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            New meeting note
          </Button>
          <IconButton
            icon={<ChevronDown className="h-4 w-4" />}
            label="Other new items"
            title="Blank note or Google Doc"
            size="sm"
            variant="secondary"
            shape="square"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-6 pt-2">
          {NOTES.map(([t, m, active]) => (
            <NoteListItem key={t} title={t} meta={m} active={active} />
          ))}
          <h4 className={`${EYEBROW} px-3 pb-1 pt-4`}>Earlier meetings</h4>
          <NoteListItem title="Meeting record May 14" meta="Read-only" icon />
          <NoteListItem title="Meeting record Apr 30" meta="Read-only" icon />
        </div>
      </aside>

      <article className="min-h-0 overflow-y-auto bg-white" data-scroll-root>
        <div className="mx-auto max-w-3xl px-8 pb-16 pt-6">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-2xl font-extrabold text-slate-800">
              PLC meeting Oct 9
            </h2>
            <Button
              variant="secondary"
              size="sm"
              icon={<Mic className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Record
            </Button>
            <IconButton
              icon={<MoreHorizontal className="h-4 w-4" />}
              label="Note options"
              size="sm"
            />
          </div>
          <p className={`${META} mt-1`}>
            Thu, Oct 9 · 3:15 PM · Priya Shah, Hannah Olson, Jordan Kim, Elena
            Ruiz, Marcus Bell
          </p>

          <NoteHeading>1. What do we want students to learn?</NoteHeading>
          <p className="text-sm leading-relaxed text-slate-700">
            Unit rates with fractions (7.RP.1) and the meaning of the constant
            of proportionality (7.RP.2b).
          </p>

          <NoteHeading>2. How will we know if they learned it?</NoteHeading>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <BarChart3
                className="h-4 w-4 text-brand-blue-primary"
                aria-hidden="true"
              />
              <span className="text-sm font-bold text-slate-800">
                {data.pinned.title}
              </span>
              <span className={META}>
                Live · team average {ia.headline.teamAveragePercent}% ·{' '}
                {ia.headline.participation.scoredStudents} of{' '}
                {ia.headline.participation.totalStudents}
              </span>
              <span className="flex-1" />
              <TextLink onClick={onData}>Open in Data overview</TextLink>
            </div>
            <div className="mb-2">
              <ItemAnalysisLegend />
            </div>
            <ItemAnalysisChart
              questions={lowest}
              flagReteach={false}
              breakAfterReteach={false}
              compact
            />
          </div>

          <NoteHeading>
            3. How will we respond when some students do not learn it?
          </NoteHeading>
          <div className="flex gap-3 rounded-xl border border-slate-200 p-4">
            <Scale
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">
                  Decision
                </span>
                <span className={META}>Oct 9</span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                Reteach Q5 in small groups Monday and Tuesday using a double
                number line. Re-check with a 3-question exit ticket Wednesday.
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <TextLink icon={Link2} onClick={onData}>
                  Q5 {q5?.text} · {data.pinned.title}
                </TextLink>
                {q5?.dominantWrong && (
                  <span className="text-slate-500">
                    {q5.correctPercent}% correct · most chose{' '}
                    {q5.dominantWrong.label}, {q5.dominantWrong.percent}%
                  </span>
                )}
                <span className="text-slate-500">Revisit Oct 16</span>
              </p>
            </div>
          </div>

          <NoteHeading>
            4. How will we extend learning for students who already know it?
          </NoteHeading>
          <p className="text-sm leading-relaxed text-slate-700">
            Rate problems with three quantities from the Unit 3 extension set.
            Elena shares her task cards.
          </p>

          <NoteHeading>Action items</NoteHeading>
          <RowList label="Action items">
            <ActionItem
              title="Build the 3-question exit ticket for Q5"
              meta="Priya Shah · due Oct 13"
            />
            <ActionItem
              title="Share extension task cards in Resources"
              meta="Elena Ruiz · due Oct 10"
            />
            <ActionItem
              title="Tag Unit 4 Quick Check questions"
              meta="Jordan Kim · due Oct 10"
            />
          </RowList>
          <TextLink quiet icon={Plus} className="mt-4">
            Add block
          </TextLink>
        </div>
      </article>
    </div>
  );
};
