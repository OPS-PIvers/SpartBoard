import React from 'react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { StudentGradesState } from '@/hooks/useStudentGrades';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import type { SeenMarks } from '@/utils/gradebook/studentGrades';
import {
  completedItems,
  type DoneItem,
  type LandingPartition,
} from '@/utils/studentLanding';
import { LandingGradebook } from './LandingGradebook';
import {
  DoneRow,
  EmptyBox,
  ListBox,
  LiveBanner,
  ResourceRow,
  WorkRow,
} from './LandingRows';
import type { LandingClass, LandingTab } from './types';
import { landingTabs, panelId, tabId } from './tabs';

interface LandingClassViewProps {
  cls: LandingClass;
  partition: LandingPartition;
  checks: TurnInMap;
  tab: LandingTab;
  onTabChange: (tab: LandingTab) => void;
  gradesEnabled: boolean;
  /** This class's grades, when the student gradebook is on. */
  grades?: StudentGradesState;
  initialSeen?: SeenMarks;
  /** Rows on the Completed or Gradebook tab. */
  doneCount: number;
  nowMs: number;
  pseudonymUid: string | null;
  onLockedClick: (a: AssignmentSummary) => void;
  onOpenGradeOnly: (item: DoneItem) => void;
}

export const LandingClassView: React.FC<LandingClassViewProps> = ({
  cls,
  partition: p,
  checks,
  tab,
  onTabChange,
  gradesEnabled,
  grades,
  initialSeen,
  doneCount,
  nowMs,
  pseudonymUid,
  onLockedClick,
  onOpenGradeOnly,
}) => {
  const head = (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {cls.name}
      </h1>
      <p className="mt-0.5 text-sm text-slate-500">
        {[cls.periodLabel, cls.teachers].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
  const empty =
    !p.live.length && !p.work.length && !p.resources.length && !p.done.length;
  if (empty && !gradesEnabled) {
    return (
      <>
        {head}
        <div className="mt-6">
          <EmptyBox text={`Nothing has been assigned in ${cls.name} yet.`} />
        </div>
      </>
    );
  }

  let body: React.ReactNode;
  if (tab === 'assignments') {
    body = p.work.length ? (
      <ListBox>
        {p.work.map((row) => (
          <WorkRow
            key={row.assignment.compositeId}
            row={row}
            nowMs={nowMs}
            pseudonymUid={pseudonymUid}
          />
        ))}
      </ListBox>
    ) : (
      <EmptyBox text="You're all caught up.">
        {p.resources.length > 0 && (
          <button
            type="button"
            onClick={() => onTabChange('resources')}
            className="mt-2 rounded text-sm font-semibold text-brand-blue-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            See {p.resources.length}{' '}
            {p.resources.length === 1 ? 'resource' : 'resources'}
          </button>
        )}
      </EmptyBox>
    );
  } else if (tab === 'resources') {
    body = p.resources.length ? (
      <ListBox>
        {p.resources.map((row) => (
          <ResourceRow
            key={row.assignment.compositeId}
            row={row}
            nowMs={nowMs}
          />
        ))}
      </ListBox>
    ) : (
      <EmptyBox text="No resources right now." />
    );
  } else if (gradesEnabled && grades) {
    body = (
      <LandingGradebook
        grades={grades}
        partition={p}
        checks={checks}
        nowMs={nowMs}
        studentUid={initialSeen ? null : pseudonymUid}
        classId={cls.classId}
        teachers={cls.teachers}
        initialSeen={initialSeen}
        onLockedClick={onLockedClick}
        onOpenGradeOnly={onOpenGradeOnly}
      />
    );
  } else {
    body = p.done.length ? (
      <ListBox>
        {completedItems(p.done).map((item) => (
          <DoneRow
            key={item.key}
            item={item}
            check={checks[item.key]}
            nowMs={nowMs}
            teachers={cls.teachers}
            onLockedClick={onLockedClick}
            onOpenGradeOnly={onOpenGradeOnly}
          />
        ))}
      </ListBox>
    ) : (
      <EmptyBox text="Nothing completed yet." />
    );
  }

  const tabs = landingTabs(p, gradesEnabled, doneCount);
  return (
    <>
      {head}
      <div className="mt-5 flex flex-col gap-4">
        <LiveBanner rows={p.live} classNameOf={() => undefined} />
        <div
          role="tablist"
          aria-label={`${cls.name} sections`}
          className="hidden grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1 min-[896px]:grid"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              id={tabId(cls.classId, t.id)}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={panelId(cls.classId)}
              onClick={() => onTabChange(t.id)}
              className={`flex min-w-0 flex-col items-center rounded-lg px-1 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-[11px] tabular-nums text-slate-500">
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <div
          id={panelId(cls.classId)}
          role="tabpanel"
          aria-labelledby={tabId(cls.classId, tab)}
        >
          {body}
        </div>
      </div>
    </>
  );
};
