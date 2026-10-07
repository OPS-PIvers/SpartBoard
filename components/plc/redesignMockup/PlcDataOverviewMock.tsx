// Screen 1: PLC Data overview (T16 to T21), charts fed by the real plcDataOverview selectors.

import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckSquare,
  Clock,
  Mic,
  MoreHorizontal,
  Pin,
  Scale,
  Sparkles,
  Target,
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { SCORE_DISTRIBUTION_BANDS } from '@/utils/scoreColor';
import { MASTERY_BAR_CLASS } from '@/components/plc/home/tiles/resultsSelectors';
import { BarRows } from './charts/BarRows';
import { ColumnChart } from './charts/ColumnChart';
import { DataTable, TableToggle } from './charts/DataTable';
import { GoalMeter } from './charts/GoalMeter';
import {
  ItemAnalysisChart,
  ItemAnalysisLegend,
} from './charts/ItemAnalysisChart';
import { TrendLine } from './charts/TrendLine';
import {
  SHORT_TITLES,
  U3_TARGET_OF,
  plcOverviewData,
  type PlcOverviewData,
} from './fixtures';
import {
  Figure,
  MenuSelect,
  META,
  PAGE,
  Section,
  SectionHead,
  TextLink,
} from './ui';

const fmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const BAND_LABEL = {
  proficient: 'Proficient',
  approaching: 'Approaching',
  beginning: 'Beginning',
} as const;

export const MeetingBanner: React.FC<{ onJoin?: () => void }> = ({
  onJoin,
}) => (
  <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-brand-blue-lighter px-4 py-2 text-sm text-brand-blue-dark md:px-6">
    <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span className="font-bold">Meeting in progress</span>
    <span className="truncate text-xs">
      PLC meeting Oct 9 · started 3:16 PM · 3 here
    </span>
    <span className="flex-1" />
    <Button size="sm" onClick={onJoin}>
      Join
    </Button>
  </div>
);

const useTables = () => {
  const [tables, setTables] = useState<Record<string, boolean>>({});
  return {
    on: (k: string) => !!tables[k],
    toggle: (k: string) => setTables((t) => ({ ...t, [k]: !t[k] })),
  };
};

const Hero: React.FC<{
  data: PlcOverviewData;
  isLead: boolean;
  onChange: () => void;
  tables: ReturnType<typeof useTables>;
  tagged: boolean;
}> = ({ data, isLead, onChange, tables, tagged }) => {
  const [sort, setSort] = useState<'low' | 'order'>('low');
  const [showAll, setShowAll] = useState(false);
  const [nudge, setNudge] = useState(true);
  const ia = data.itemAnalysis;
  const ordered = useMemo(
    () =>
      sort === 'low'
        ? ia.questions
        : [...ia.questions].sort((a, b) => a.number - b.number),
    [ia.questions, sort]
  );
  const shown = showAll ? ordered : ordered.slice(0, 8);
  const p = ia.headline.participation;
  return (
    <Section first label="Featured assessment">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-slate-800">
            {data.pinned.title}
          </h2>
          <p className={`${META} mt-1 flex flex-wrap items-center gap-1`}>
            Common assessment · closed {fmt.format(data.pinned.opensAt ?? 0)} ·{' '}
            {ia.questions.length} questions ·
            <Pin className="h-3 w-3" aria-hidden="true" />
            Pinned by Priya Shah
          </p>
          {isLead && nudge && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Clock
                  className="h-3.5 w-3.5 text-slate-400"
                  aria-hidden="true"
                />
                Newer results: {data.newer.title},{' '}
                {fmt.format(data.newer.opensAt ?? 0)}.
              </span>
              <TextLink>Show latest</TextLink>
              <TextLink quiet onClick={() => setNudge(false)}>
                Keep pinned
              </TextLink>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLead && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Pin className="h-3.5 w-3.5" aria-hidden="true" />}
              title="Change what the team sees first"
              onClick={onChange}
            >
              Change
            </Button>
          )}
          <Button variant="secondary" size="sm">
            Open results
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-12 gap-y-4">
        <Figure
          value={`${ia.headline.teamAveragePercent ?? 0}%`}
          label="Team average"
        />
        <Figure
          value={
            <>
              {p.scoredStudents}{' '}
              <span className="text-lg font-semibold text-slate-400">
                of {p.totalStudents}
              </span>
            </>
          }
          label={`Participation · ${p.percent ?? 0}%`}
        />
        <Figure value={ia.reteachCount} label="Questions to reteach" />
      </div>

      <div className="mt-6">
        <SectionHead title="Item analysis">
          <MenuSelect
            label="Sort questions"
            value={sort}
            onChange={(v) => setSort(v as 'low' | 'order')}
            options={[
              { value: 'low', label: 'Lowest first' },
              { value: 'order', label: 'Question order' },
            ]}
          />
          <ItemAnalysisLegend />
          <TableToggle
            table={tables.on('ia')}
            onToggle={() => tables.toggle('ia')}
          />
        </SectionHead>
        {tables.on('ia') ? (
          <DataTable
            caption="Item analysis"
            head={['Question', 'Correct', 'Most common wrong answer']}
            rows={ordered.map((q) => [
              `Q${q.number} ${q.text}`,
              `${q.correctPercent ?? 0}%`,
              q.dominantWrong
                ? `${q.dominantWrong.label}, ${q.dominantWrong.percent}%`
                : '',
            ])}
          />
        ) : (
          <>
            <ItemAnalysisChart
              questions={shown}
              breakAfterReteach={sort === 'low'}
              targetOf={tagged ? U3_TARGET_OF : undefined}
            />
            <TextLink className="mt-2" onClick={() => setShowAll((v) => !v)}>
              {showAll
                ? 'Show fewer'
                : `Show all ${ia.questions.length} questions`}
            </TextLink>
          </>
        )}
      </div>
    </Section>
  );
};

export const PlcDataOverviewMock: React.FC<{
  isLead: boolean;
  tagged: boolean;
  onLayout: () => void;
  onTargets: () => void;
  onNote: () => void;
  onItems: () => void;
}> = ({ isLead, tagged, onLayout, onTargets, onNote, onItems }) => {
  const data = useMemo(() => plcOverviewData(tagged), [tagged]);
  const tables = useTables();
  const dist = data.distribution;
  const distYMax =
    Math.ceil(Math.max(...dist.bands.map((b) => b.count)) / 20) * 20;
  const partRows = [...data.participation.rows].reverse();
  const partMin = Math.min(...partRows.map((r) => r.students.percent ?? 0));
  const mastery = data.mastery.tagged ? data.mastery.targets : [];
  return (
    <div className={PAGE}>
      <Hero
        data={data}
        isLead={isLead}
        onChange={onLayout}
        tables={tables}
        tagged={tagged}
      />

      <Section label="Results across assessments">
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-3">
          <div className="min-w-0">
            <SectionHead title="Score distribution" meta="Unit 3">
              <TableToggle
                table={tables.on('dist')}
                onToggle={() => tables.toggle('dist')}
              />
            </SectionHead>
            {tables.on('dist') ? (
              <DataTable
                head={['Score', 'Students']}
                rows={dist.bands.map((b) => [b.label, b.count])}
              />
            ) : (
              <ColumnChart
                ariaLabel="Score distribution for Unit 3 Ratios CFA"
                yMax={distYMax}
                yTicks={[0, distYMax / 2, distYMax]}
                xTitle="Score (%)"
                columns={dist.bands.map((b) => ({
                  key: b.label,
                  x: b.label.replace('%', ''),
                  value: b.count,
                  label: String(b.count),
                  bg:
                    SCORE_DISTRIBUTION_BANDS.find((s) => s.min === b.min)
                      ?.color ?? 'bg-slate-300',
                  ariaLabel: `${b.label}, ${b.count} students`,
                  tip: {
                    heading: b.label,
                    rows: [
                      {
                        value: `${b.count} students`,
                        label: `${b.percent}% of ${dist.total}`,
                      },
                    ],
                  },
                }))}
              />
            )}
          </div>
          <div className="min-w-0">
            <SectionHead title="Team average over time">
              <TableToggle
                table={tables.on('trend')}
                onToggle={() => tables.toggle('trend')}
              />
            </SectionHead>
            {tables.on('trend') ? (
              <DataTable
                head={['Assessment', 'Average']}
                rows={data.trend.map((p) => [
                  p.title,
                  `${p.teamAveragePercent}%`,
                ])}
              />
            ) : (
              <TrendLine
                points={data.trend}
                shortTitles={SHORT_TITLES}
                ariaLabel="Team average across common assessments"
              />
            )}
          </div>
          <div className="min-w-0">
            <SectionHead title="Participation">
              <TableToggle
                table={tables.on('part')}
                onToggle={() => tables.toggle('part')}
              />
            </SectionHead>
            {tables.on('part') ? (
              <DataTable
                head={['Assessment', 'Students', 'Rate']}
                rows={partRows.map((r) => [
                  r.title,
                  `${r.students.scoredStudents} of ${r.students.totalStudents}`,
                  `${r.students.percent ?? 0}%`,
                ])}
              />
            ) : (
              <ColumnChart
                ariaLabel="Participation by assessment"
                yMax={100}
                yTicks={[0, 50, 100]}
                yUnit="%"
                maxBarWidth={28}
                columns={partRows.map((r, i) => {
                  const pct = r.students.percent ?? 0;
                  const labelled = i === partRows.length - 1 || pct === partMin;
                  return {
                    key: r.assessmentId,
                    x: SHORT_TITLES[r.assessmentId] ?? r.title,
                    value: pct,
                    ...(labelled ? { label: `${pct}%` } : {}),
                    bg: 'bg-brand-blue-light',
                    ariaLabel: `${r.title}, ${pct} percent`,
                    tip: {
                      heading: `${r.title} · ${fmt.format(r.date)}`,
                      rows: [
                        {
                          value: `${pct}%`,
                          label: `${r.students.scoredStudents} of ${r.students.totalStudents} students`,
                        },
                        {
                          value: `${r.teachersRan} of ${r.teachersExpected}`,
                          label: 'teachers ran it',
                        },
                      ],
                    },
                  };
                })}
              />
            )}
          </div>
        </div>
      </Section>

      {data.mastery.tagged ? (
        <Section label="Mastery by learning target">
          <SectionHead
            title="Mastery by learning target"
            meta="Unit 3 Ratios CFA · percent correct on tagged questions"
          >
            {isLead && (
              <TextLink icon={Target} onClick={onTargets}>
                Manage targets
              </TextLink>
            )}
            <TableToggle
              table={tables.on('mast')}
              onToggle={() => tables.toggle('mast')}
            />
          </SectionHead>
          {tables.on('mast') ? (
            <DataTable
              head={['Target', 'Correct', 'Band', 'Questions']}
              rows={mastery.map((m) => [
                `${m.code} ${m.label}`,
                `${m.correctPercent ?? 0}%`,
                m.band ? BAND_LABEL[m.band] : '',
                Math.round(m.attempted / 132),
              ])}
            />
          ) : (
            <BarRows
              ticks={[
                0,
                data.mastery.cutoffs.approaching,
                data.mastery.cutoffs.proficient,
                100,
              ]}
              columns="grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,13rem)]"
              rows={mastery.map((m) => {
                const pct = m.correctPercent ?? 0;
                const questions = Math.round(m.attempted / 132);
                const band = m.band ? BAND_LABEL[m.band] : 'Too few answers';
                return {
                  key: m.targetId,
                  label: (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-14 shrink-0 font-bold text-slate-800">
                        {m.code}
                      </span>
                      <span className="truncate" title={m.label}>
                        {m.label}
                      </span>
                    </span>
                  ),
                  segments: [
                    {
                      value: pct,
                      bg: m.band ? MASTERY_BAR_CLASS[m.band] : 'bg-slate-300',
                    },
                  ],
                  value: (
                    <span className="flex items-baseline gap-2">
                      <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-slate-800">
                        {pct}%
                      </span>
                      <span className="truncate">
                        {band} · {questions}{' '}
                        {questions === 1 ? 'question' : 'questions'}
                      </span>
                    </span>
                  ),
                  ariaLabel: `${m.code}, ${pct} percent correct, ${band}`,
                  tip: {
                    heading: `${m.code} · ${m.label}`,
                    rows: [
                      {
                        value: `${pct}%`,
                        label: `correct, ${band.toLowerCase()}`,
                        swatch: m.band
                          ? MASTERY_BAR_CLASS[m.band]
                          : 'bg-slate-300',
                      },
                      { value: String(questions), label: 'tagged questions' },
                    ],
                  },
                };
              })}
            />
          )}
        </Section>
      ) : (
        isLead && (
          <Section label="Learning targets">
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Target className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Tag questions to learning targets to see mastery by target.
              <TextLink onClick={onTargets}>Tag questions</TextLink>
            </p>
          </Section>
        )
      )}

      <Section label="Assessments and goal">
        <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            <SectionHead title="Recent assessments">
              <TextLink>All assessments</TextLink>
            </SectionHead>
            <DataTable
              head={['Assessment', 'Closed', 'Average', 'Participation']}
              rows={[...data.trend]
                .reverse()
                .slice(0, 4)
                .map((t) => {
                  const part = data.participation.rows.find(
                    (r) => r.assessmentId === t.assessmentId
                  );
                  return [
                    <button
                      key={t.assessmentId}
                      type="button"
                      className="text-left font-semibold text-brand-blue-primary hover:text-brand-blue-dark"
                    >
                      {t.title}
                    </button>,
                    fmt.format(t.date),
                    `${t.teamAveragePercent}%`,
                    `${part?.students.scoredStudents ?? 0} of ${part?.students.totalStudents ?? 0}`,
                  ];
                })}
            />
          </div>
          <div className="min-w-0">
            <SectionHead title="Goal">
              {isLead && (
                <IconButton
                  icon={<MoreHorizontal className="h-4 w-4" />}
                  label="Goal options"
                  size="sm"
                />
              )}
            </SectionHead>
            <p className="mb-3 text-sm leading-relaxed text-slate-700">
              By May 2027, 80% of students score 75% or higher on unit CFAs, up
              from 58% on Unit 1, through weekly small-group reteach.
            </p>
            <GoalMeter
              now={64}
              baseline={58}
              goal={80}
              measure="Students at 75% or higher"
              nowSource="Unit 3 Ratios CFA"
              baselineSource="baseline, Unit 1"
              goalDate="May 2027"
            />
            <div className="mt-1 flex items-center">
              <span className={META}>Students at 75% or higher</span>
              <span className="flex-1" />
              {isLead && (
                <TextLink quiet icon={Sparkles}>
                  Check this goal
                </TextLink>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section label="Next meeting and open items">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <CalendarDays
              className="h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <span className="font-semibold text-slate-800">Next meeting</span>
            <span className="text-slate-500">Thu, Oct 9 · 3:15 PM</span>
            <TextLink onClick={onNote}>Open note</TextLink>
          </span>
          <span className="inline-flex items-center gap-2">
            <CheckSquare
              className="h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <span className="font-semibold text-slate-800">Open items</span>
            <span className="text-slate-500">5 · 2 yours</span>
            <TextLink onClick={onItems}>View</TextLink>
          </span>
          <span className="inline-flex items-center gap-2">
            <Scale className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span className="font-semibold text-slate-800">
              Decisions to revisit
            </span>
            <span className="text-slate-500">1 · Oct 16</span>
          </span>
        </div>
      </Section>
    </div>
  );
};
