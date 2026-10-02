import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, GraduationCap, LogOut } from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { StudentGradesState } from '@/hooks/useStudentGrades';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import {
  studentGradeRows,
  type SeenMarks,
} from '@/utils/gradebook/studentGrades';
import {
  gradebookItems,
  partitionForClass,
  type DoneItem,
  type LandingPartition,
} from '@/utils/studentLanding';
import { LandingClassList } from './LandingClassList';
import { LandingClassView } from './LandingClassView';
import { landingTabs, panelId } from './tabs';
import { LandingOverview } from './LandingOverview';
import type { LandingClass, LandingTab } from './types';

export interface StudentLandingLayoutProps {
  classes: LandingClass[];
  partition: LandingPartition;
  checks: TurnInMap;
  inSessionIds: ReadonlySet<string>;
  nowMs: number;
  selectedClassId: string | null;
  onSelectClass: (classId: string | null) => void;
  tab: LandingTab;
  onTabChange: (tab: LandingTab) => void;
  gradesEnabled: boolean;
  /** The selected class's grades, when the student gradebook is on. */
  grades?: StudentGradesState;
  /** New marks for a gradebook with no stored copy (dev harness). */
  initialSeen?: SeenMarks;
  firstName: string | null;
  pseudonymUid: string | null;
  onSignOut: () => void;
  onLockedClick: (a: AssignmentSummary) => void;
  onOpenGradeOnly: (item: DoneItem) => void;
  /** Shown above the page content, e.g. a partial-load warning. */
  notice?: React.ReactNode;
}

const SignOutButton: React.FC<{
  onClick: () => void;
  tone: 'dark' | 'light';
}> = ({ onClick, tone }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 ${
      tone === 'dark'
        ? 'border-white/25 text-white hover:bg-white/10 focus-visible:ring-white'
        : 'border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:ring-brand-blue-primary'
    }`}
  >
    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
    Sign out
  </button>
);

// D23: Chromebook width and up keeps the sidebar; narrower gets the class sheet and a bottom tab bar.
export const StudentLandingLayout: React.FC<StudentLandingLayoutProps> = ({
  classes,
  partition,
  checks,
  inSessionIds,
  nowMs,
  selectedClassId,
  onSelectClass,
  tab,
  onTabChange,
  gradesEnabled,
  grades,
  initialSeen,
  firstName,
  pseudonymUid,
  onSignOut,
  onLockedClick,
  onOpenGradeOnly,
  notice,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const byId = useMemo(
    () => new Map(classes.map((c) => [c.classId, c])),
    [classes]
  );
  const selected = selectedClassId ? byId.get(selectedClassId) : undefined;
  const classOf = (a: AssignmentSummary): LandingClass | undefined =>
    a.classIds.map((id) => byId.get(id)).find(Boolean);
  const classPartition = useMemo(
    () => (selected ? partitionForClass(partition, selected.classId) : null),
    [partition, selected]
  );
  const doneCount = useMemo(() => {
    if (!classPartition) return 0;
    if (!gradesEnabled || grades?.status !== 'ready')
      return classPartition.done.length;
    return gradebookItems(classPartition, studentGradeRows(grades.data)).length;
  }, [classPartition, gradesEnabled, grades]);

  const select = (classId: string | null) => {
    setSheetOpen(false);
    onSelectClass(classId);
    mainRef.current?.scrollTo?.({ top: 0 });
  };
  const changeTab = (next: LandingTab) => {
    onTabChange(next);
    mainRef.current?.scrollTo?.({ top: 0 });
  };

  // The sheet is a modal: Escape closes it, focus moves in, and returns to the trigger.
  useEffect(() => {
    if (!sheetOpen) return;
    const trigger = sheetTriggerRef.current;
    sheetRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [sheetOpen]);

  const classList = (
    <LandingClassList
      classes={classes}
      partition={partition}
      inSessionIds={inSessionIds}
      selectedClassId={selected?.classId ?? null}
      onSelect={select}
      nowMs={nowMs}
    />
  );

  return (
    <div className="relative flex h-screen [height:100dvh] w-screen flex-col overflow-hidden bg-slate-50 font-sans">
      <header className="flex h-[60px] shrink-0 items-center gap-3 bg-brand-blue-primary px-4 text-white min-[896px]:h-[68px] min-[896px]:px-6">
        <span
          aria-hidden="true"
          className="hidden h-9 w-9 items-center justify-center rounded-xl bg-white/15 min-[896px]:inline-flex"
        >
          <GraduationCap className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <span className="hidden text-lg font-bold tracking-tight min-[896px]:inline">
          {APP_NAME}
        </span>
        <button
          ref={sheetTriggerRef}
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="inline-flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white min-[896px]:hidden"
        >
          <span className="truncate text-base font-bold">
            {selected?.name ?? 'Overview'}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
        <span className="ml-auto hidden items-center gap-3 text-sm text-white/90 min-[896px]:flex">
          {firstName && <span>{firstName}</span>}
          <SignOutButton onClick={onSignOut} tone="dark" />
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 pb-6 min-[896px]:block">
          {classList}
        </aside>
        <main
          ref={mainRef}
          className="min-w-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 min-[896px]:px-8 min-[896px]:pt-7"
        >
          <div className="mx-auto max-w-3xl">
            {notice}
            {selected && classPartition ? (
              <LandingClassView
                key={selected.classId}
                cls={selected}
                partition={classPartition}
                checks={checks}
                tab={tab}
                onTabChange={changeTab}
                gradesEnabled={gradesEnabled}
                grades={grades}
                initialSeen={initialSeen}
                doneCount={doneCount}
                nowMs={nowMs}
                pseudonymUid={pseudonymUid}
                onLockedClick={onLockedClick}
                onOpenGradeOnly={onOpenGradeOnly}
              />
            ) : (
              <LandingOverview
                partition={partition}
                classOf={classOf}
                firstName={firstName}
                nowMs={nowMs}
                pseudonymUid={pseudonymUid}
              />
            )}
          </div>
        </main>
      </div>

      {selected && classPartition && (
        <nav
          aria-label={`${selected.name} sections`}
          className="grid shrink-0 grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] min-[896px]:hidden"
        >
          {landingTabs(classPartition, gradesEnabled, doneCount).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => changeTab(t.id)}
                aria-current={active ? 'page' : undefined}
                aria-controls={panelId(selected.classId)}
                className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary ${
                  active ? 'text-brand-blue-primary' : 'text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                <span className="max-w-full truncate text-xs font-semibold">
                  {t.label}{' '}
                  <span className="font-normal tabular-nums">{t.count}</span>
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {sheetOpen && (
        <>
          <button
            type="button"
            aria-label="Close class list"
            tabIndex={-1}
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 z-20 bg-slate-900/30 min-[896px]:hidden"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a class"
            className="absolute inset-x-0 bottom-0 z-30 max-h-[80%] overflow-y-auto rounded-t-2xl bg-white p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl min-[896px]:hidden"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300"
            />
            {classList}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 px-2.5 pt-3 text-sm text-slate-600">
              <span className="truncate">{firstName ?? ''}</span>
              <SignOutButton onClick={onSignOut} tone="light" />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
