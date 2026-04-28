import React from 'react';
import { GraduationCap, LayoutGrid, LogOut } from 'lucide-react';
import { getClassColor } from '@/utils/studentClassColors';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';

interface StudentSidebarProps {
  classes: ClassDirectoryEntry[];
  /** classIds the student has in claims — used to render fallbacks for any
   *  ids the directory didn't resolve, so the sidebar never silently
   *  drops a class. */
  claimedClassIds: readonly string[];
  activeClassId: string | null;
  /** Active assignment counts per classId. Each value is the number of
   *  *currently active* (not yet completed) assignments for that class. */
  activeCountByClassId: Record<string, number>;
  totalActiveCount: number;
  onSelect: (classId: string | null) => void;
  /** Sign-out handler. Renders the profile-style footer when provided. */
  onSignOut?: () => void;
  /**
   * Student's first name from the Google ID token at sign-in. Tab-scoped,
   * never written to Firestore. When `null`, the footer falls back to a
   * generic "Signed in" greeting.
   */
  firstName?: string | null;
  /** Total count of claim-bound classes. Shown in the footer meta line. */
  classCount?: number;
}

export const StudentSidebar: React.FC<StudentSidebarProps> = ({
  classes,
  claimedClassIds,
  activeClassId,
  activeCountByClassId,
  totalActiveCount,
  onSelect,
  onSignOut,
  firstName,
  classCount,
}) => {
  // Render in the order the directory returned, then any unresolved claim
  // ids at the end so a slow-loading directory never hides a class.
  const resolvedIds = new Set(classes.map((c) => c.classId));
  const fallbackIds = claimedClassIds.filter((id) => !resolvedIds.has(id));
  const fallbackEntries: ClassDirectoryEntry[] = fallbackIds.map((id) => ({
    classId: id,
    name: 'Class',
    teacherDisplayName: '',
  }));
  const allEntries = [...classes, ...fallbackEntries];

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-y-auto border-r border-slate-200 bg-white/95 px-3 py-5 backdrop-blur-sm md:gap-4 md:bg-white/85 md:px-3.5 md:py-6">
      <div className="flex flex-1 flex-col">
        <div className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
          My classes
        </div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <ClassButton
              isActive={activeClassId === null}
              barColor="#1D2A5D"
              title="All classes"
              meta="Today's overview"
              count={totalActiveCount}
              icon={<LayoutGrid className="h-4 w-4" strokeWidth={2.25} />}
              onClick={() => onSelect(null)}
            />
          </li>
          {allEntries.map((c) => {
            const color = getClassColor(c.classId);
            const meta = c.teacherDisplayName
              ? c.subject
                ? `${c.subject} · ${c.teacherDisplayName}`
                : c.teacherDisplayName
              : (c.subject ?? c.code ?? ' ');
            return (
              <li key={c.classId}>
                <ClassButton
                  isActive={activeClassId === c.classId}
                  barColor={color.bar}
                  title={c.name}
                  meta={meta}
                  count={activeCountByClassId[c.classId] ?? 0}
                  onClick={() => onSelect(c.classId)}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {onSignOut && (
        <div className="mt-auto flex items-center gap-3 border-t border-slate-200 px-2 pt-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue-primary/10 text-brand-blue-primary">
            {firstName ? (
              <span className="text-xs font-bold uppercase">
                {firstName.charAt(0)}
              </span>
            ) : (
              <GraduationCap className="h-4 w-4" strokeWidth={2.25} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-700">
              {firstName ? `Hi, ${firstName}` : 'Signed in'}
            </div>
            {typeof classCount === 'number' && classCount > 0 && (
              <div className="truncate text-[11px] text-slate-500">
                {classCount} {classCount === 1 ? 'class' : 'classes'}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1"
          >
            <LogOut className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      )}
    </div>
  );
};

interface ClassButtonProps {
  isActive: boolean;
  barColor: string;
  title: string;
  meta: string;
  count: number;
  icon?: React.ReactNode;
  onClick: () => void;
}

const ClassButton: React.FC<ClassButtonProps> = ({
  isActive,
  barColor,
  title,
  meta,
  count,
  icon,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1 ${
      isActive
        ? 'bg-white shadow-sm ring-1 ring-slate-200'
        : 'hover:bg-slate-100/80'
    }`}
  >
    <span
      aria-hidden="true"
      className="h-9 w-1 shrink-0 rounded-full"
      style={{ background: barColor }}
    />
    {icon && (
      <span
        aria-hidden="true"
        className="text-slate-400 group-hover:text-slate-600"
      >
        {icon}
      </span>
    )}
    <span className="min-w-0 flex-1">
      <span
        className={`block truncate text-sm font-semibold leading-tight ${
          isActive ? 'text-slate-900' : 'text-slate-700'
        }`}
      >
        {title}
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-slate-500">
        {meta}
      </span>
    </span>
    {count > 0 && (
      <span
        aria-label={`${count} active`}
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
          isActive
            ? 'bg-brand-blue-primary text-white'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        {count}
      </span>
    )}
  </button>
);
