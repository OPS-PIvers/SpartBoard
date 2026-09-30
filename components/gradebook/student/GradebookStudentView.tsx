import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Btn } from '@/components/admin/Organization/components/primitives';
import { useGradebook } from '@/components/gradebook/GradebookContext';
import { GradebookPopovers } from '@/components/gradebook/GradebookPopovers';
import { Private } from '@/components/gradebook/Private';
import { buildGradebookPath } from '@/utils/gradebookPath';
import { spaNavigate, spaReplace } from '@/utils/plcPath';
import { proficiencyLevel } from '@/utils/gradebook/gradebookCore';
import {
  collectTargets,
  proficiencyTable,
  targetName,
  type AnalysisData,
} from '@/utils/gradebook/gradebookAnalysis';
import { buildInsights } from '@/utils/gradebook/gradebookInsights';
import {
  proficientCount,
  standardsRows,
  workHabits,
  type StudentCardId,
} from './studentViewModel';
import { useStudentCardLayout } from './useStudentCardLayout';
import {
  AssignmentsCard,
  CompareCard,
  HabitsCard,
  InsightsCard,
  PerformanceCard,
  StandardsCard,
} from './StudentCards';

const CARD_META: Record<StudentCardId, { title: string; span: string }> = {
  performance: { title: 'Performance', span: 'lg:col-span-8' },
  habits: { title: 'Work habits', span: 'lg:col-span-4' },
  standards: {
    title: 'Standards and learning targets',
    span: 'lg:col-span-12',
  },
  compare: { title: 'Compared with the class', span: 'lg:col-span-6' },
  insights: { title: 'Needs attention', span: 'lg:col-span-6' },
  assignments: { title: 'Assignments', span: 'lg:col-span-12' },
};

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

/** D26 teacher-facing student view: KPIs and a customizable grid of cards. */
export const GradebookStudentView: React.FC<{ studentUid: string }> = ({
  studentUid,
}) => {
  const gb = useGradebook();
  const { rosterId, students, columns, getCell, settings, scale, now } = gb;
  const overallOf = gb.overall;
  const idx = students.findIndex((s) => s.uid === studentUid);
  const student = idx >= 0 ? students[idx] : null;
  const layout = useStudentCardLayout();
  const [customize, setCustomize] = useState(false);

  const prevUid = students[idx - 1]?.uid ?? null;
  const nextUid = idx >= 0 ? (students[idx + 1]?.uid ?? null) : null;
  const goTo = (uid: string | null): void => {
    if (uid) spaReplace(buildGradebookPath(rosterId, 'student', uid));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const uid =
        e.key === 'ArrowLeft'
          ? prevUid
          : e.key === 'ArrowRight'
            ? nextUid
            : null;
      if (uid) spaReplace(buildGradebookPath(rosterId, 'student', uid));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rosterId, prevUid, nextUid]);

  const analysis = useMemo(() => {
    const data: AnalysisData = {
      students: students.map((s) => ({
        uid: s.uid,
        studentId: s.student.id,
        name: s.displayName,
      })),
      columns,
      cell: getCell,
      overallPct: (uid) => overallOf(uid).pct,
    };
    return { data, targets: collectTargets(data, () => undefined) };
  }, [students, columns, getCell, overallOf]);

  const targetRows = useMemo(() => {
    const names = new Map(analysis.targets.map((t) => [t.id, t]));
    return standardsRows(
      columns,
      getCell,
      studentUid,
      settings.method,
      scale,
      (id) => {
        const t = names.get(id);
        return t ? targetName(t) : id;
      }
    ).map((r) => ({ ...r, target: names.get(r.targetId) ?? null }));
  }, [analysis, columns, getCell, studentUid, settings.method, scale]);

  const insights = useMemo(
    () =>
      buildInsights({
        data: analysis.data,
        students: analysis.data.students,
        columns,
        assessmentCategoryId: settings.categoriesEnabled
          ? (settings.categories[0]?.id ?? null)
          : null,
        targets: analysis.targets,
        proficiency: proficiencyTable(analysis.data, columns, settings.method),
        scale,
        onlyUid: studentUid,
      }),
    [analysis, columns, settings, scale, studentUid]
  );

  const habits = useMemo(
    () => workHabits(columns, getCell, studentUid, now),
    [columns, getCell, studentUid, now]
  );

  const back = (): void => spaNavigate(buildGradebookPath(rosterId));

  if (!student) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Btn variant="ghost" icon={<ArrowLeft size={16} />} onClick={back}>
          Grades
        </Btn>
        <p className="text-sm text-slate-500">
          This student is not in this class.
        </p>
      </div>
    );
  }

  const overall = overallOf(studentUid);
  const level = proficiencyLevel(overall.pct, scale);
  const prof = proficientCount(targetRows);
  const visible = layout.order.filter(
    (id) => customize || !layout.hidden.includes(id)
  );

  const move = (id: StudentCardId, delta: -1 | 1): void => {
    const order = [...layout.order];
    const i = order.indexOf(id);
    const j = order.indexOf(visible[visible.indexOf(id) + delta]);
    if (i < 0 || j < 0) return;
    [order[i], order[j]] = [order[j], order[i]];
    layout.save({ order, hidden: layout.hidden });
  };
  const toggleHidden = (id: StudentCardId): void => {
    const hidden = layout.hidden.includes(id)
      ? layout.hidden.filter((x) => x !== id)
      : [...layout.hidden, id];
    layout.save({ order: layout.order, hidden });
  };

  const cardProps = { studentUid, first: student.firstName, scale };
  const body = (id: StudentCardId): React.ReactNode => {
    switch (id) {
      case 'performance':
        return <PerformanceCard key={studentUid} {...cardProps} />;
      case 'habits':
        return <HabitsCard habits={habits} />;
      case 'standards':
        return (
          <StandardsCard
            key={studentUid}
            rows={targetRows}
            scale={scale}
            method={settings.method}
          />
        );
      case 'compare':
        return <CompareCard {...cardProps} />;
      case 'insights':
        return <InsightsCard insights={insights} />;
      case 'assignments':
        return <AssignmentsCard studentUid={studentUid} />;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Btn variant="ghost" icon={<ArrowLeft size={16} />} onClick={back}>
          Grades
        </Btn>
        <Btn
          size="sm"
          aria-label="Previous student"
          title="Previous student (←)"
          disabled={!prevUid}
          onClick={() => goTo(prevUid)}
          className="w-8 !px-0"
        >
          <ChevronLeft size={14} />
        </Btn>
        <h2 className="text-xl font-bold text-slate-900">
          <Private>
            {student.firstName} {student.lastName}
          </Private>
        </h2>
        <Btn
          size="sm"
          aria-label="Next student"
          title="Next student (→)"
          disabled={!nextUid}
          onClick={() => goTo(nextUid)}
          className="w-8 !px-0"
        >
          <ChevronRight size={14} />
        </Btn>
        <span className="flex-1" />
        <Btn
          variant={customize ? 'secondary' : 'ghost'}
          aria-pressed={customize}
          onClick={() => setCustomize((v) => !v)}
        >
          {customize ? 'Done' : 'Customize cards'}
        </Btn>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          value={overall.pct === null ? '–' : `${overall.pct.toFixed(1)}%`}
          label={
            level === null ? 'Overall' : `Overall · ${scale.levelNames[level]}`
          }
        />
        <Kpi value={String(habits.missing)} label="Missing" />
        <Kpi value={String(habits.late)} label="Late" />
        <Kpi
          value={`${prof.proficient}/${prof.total}`}
          label={`Targets ${scale.levelNames[0].toLowerCase()}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {visible.map((id, n) => {
          const hidden = layout.hidden.includes(id);
          return (
            <section
              key={id}
              className={`${CARD_META[id].span} flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${hidden ? 'opacity-45' : ''}`}
            >
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                {CARD_META[id].title}
                <span className="flex-1" />
                {customize && (
                  <span className="inline-flex gap-1">
                    <CardCtl
                      label="Move up"
                      disabled={n === 0}
                      onClick={() => move(id, -1)}
                    >
                      ↑
                    </CardCtl>
                    <CardCtl
                      label="Move down"
                      disabled={n === visible.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      ↓
                    </CardCtl>
                    <CardCtl onClick={() => toggleHidden(id)}>
                      {hidden ? 'Show' : 'Hide'}
                    </CardCtl>
                  </span>
                )}
              </h3>
              {hidden ? (
                <div className="text-xs text-slate-500">Hidden</div>
              ) : (
                body(id)
              )}
            </section>
          );
        })}
      </div>
      <GradebookPopovers onCellClose={gb.closePopover} />
    </div>
  );
};

const Kpi: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <div className="flex flex-col gap-0.5 rounded-2xl border border-slate-200 bg-white px-[18px] py-4 shadow-sm">
    <b className="text-2xl font-bold text-slate-900">
      <Private>{value}</Private>
    </b>
    <span className="text-xs text-slate-500">{label}</span>
  </div>
);

const CardCtl: React.FC<{
  label?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, disabled, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
  >
    {children}
  </button>
);
