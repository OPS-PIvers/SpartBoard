import React, {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronRight } from 'lucide-react';
import type { ClassRoster } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import { useCourses } from '@/hooks/useCourses';
import type { Course } from '@/utils/course/contract';
import { courseGroups } from '@/utils/course/courseGroups';
import {
  studentCountLabel,
  withClassIds,
  type AssignClassesValue,
} from './assignClassesValue';
import { ClassChecklistCoursesContext } from './classChecklistCourses';
import {
  tourAttr,
  tourFieldAttr,
  type TourAnchorAttrs,
} from '@/config/tourAnchors';

export interface ClassChecklistProps {
  rosters: ClassRoster[];
  value: AssignClassesValue;
  onChange: (next: AssignClassesValue) => void;
  /** One class at most (Video Activity live). */
  singleSelect?: boolean;
  disabled?: boolean;
  /** Live-tour anchor for the list. */
  anchor?: TourAnchorAttrs;
  /** Live-tour anchor for one class's checkbox, keyed by class id. */
  rowAnchor?: (classId: string, rowIndex: number) => TourAnchorAttrs;
}

/** The teacher's Courses, or none when the course-agenda flag is off or there's no signed-in teacher. */
function useChecklistCourses(): readonly Course[] {
  const auth = useContext(AuthContext);
  const given = useContext(ClassChecklistCoursesContext) ?? undefined;
  const on = given === undefined && !!auth?.canAccessFeature('course-agenda');
  const { courses } = useCourses(on);
  return given ?? courses;
}

const Checkbox: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }
> = ({ indeterminate = false, ...rest }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      {...rest}
      className="h-4 w-4 shrink-0 rounded-sm accent-brand-blue-primary"
    />
  );
};

/** Classes as an inline checklist that scrolls after about six rows; a Course is one row that opens to its sections. */
export const ClassChecklist: React.FC<ClassChecklistProps> = ({
  rosters,
  value,
  onChange,
  singleSelect = false,
  disabled = false,
  anchor,
  rowAnchor,
}) => {
  const groupName = useId();
  const courses = useChecklistCourses();
  const groups = useMemo(
    () =>
      singleSelect
        ? rosters.map((r) => ({ course: null, rosters: [r] }))
        : courseGroups(courses, rosters),
    [singleSelect, courses, rosters]
  );
  const indexOf = useMemo(
    () => new Map(rosters.map((r, i) => [r.id, i])),
    [rosters]
  );
  const [openById, setOpenById] = useState<Record<string, boolean>>({});

  // Picks outside this list (a class gone from an edited assignment) are kept.
  const setPicked = (ids: Set<string>) =>
    onChange(
      withClassIds(value, [
        ...rosters.map((r) => r.id).filter((id) => ids.has(id)),
        ...value.classIds.filter((id) => !indexOf.has(id) && ids.has(id)),
      ])
    );

  const toggle = (id: string) => {
    if (singleSelect) {
      onChange(withClassIds(value, [id]));
      return;
    }
    const ids = new Set(value.classIds);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setPicked(ids);
  };

  const toggleCourse = (members: ClassRoster[]) => {
    const available = members.filter((r) => !r.loadError);
    const all = available.every((r) => value.classIds.includes(r.id));
    const ids = new Set(value.classIds);
    for (const r of available) {
      if (all) ids.delete(r.id);
      else ids.add(r.id);
    }
    setPicked(ids);
  };

  const selectAll = () =>
    onChange(
      withClassIds(
        value,
        rosters.filter((r) => !r.loadError).map((r) => r.id)
      )
    );

  const renderRow = (r: ClassRoster, courseId: string | null) => {
    const inCourse = courseId !== null;
    const rowIndex = indexOf.get(r.id) ?? 0;
    const unavailable = Boolean(r.loadError);
    const off = unavailable || disabled;
    return (
      <label
        key={r.id}
        title={unavailable ? r.loadError : undefined}
        className={`flex items-center gap-2.5 py-2 pr-3 text-sm ${
          inCourse ? 'pl-9' : 'pl-3'
        } ${
          unavailable
            ? 'cursor-not-allowed text-slate-400'
            : disabled
              ? 'cursor-not-allowed text-slate-800'
              : 'cursor-pointer text-slate-800 hover:bg-slate-50'
        }`}
      >
        <input
          type={singleSelect ? 'radio' : 'checkbox'}
          name={singleSelect ? groupName : undefined}
          checked={value.classIds.includes(r.id)}
          disabled={off}
          onChange={() => {
            if (courseId !== null)
              setOpenById((prev) => ({ ...prev, [courseId]: true }));
            toggle(r.id);
          }}
          {...(rowAnchor?.(r.id, rowIndex) ??
            tourFieldAttr(
              'assign-classes.option',
              'assign',
              `row-${rowIndex + 1}`
            ))}
          className="h-4 w-4 shrink-0 rounded-sm accent-brand-blue-primary"
        />
        <span className="min-w-0 flex-1 wrap-anywhere">{r.name}</span>
        <span className="shrink-0 text-xs text-slate-400">
          {unavailable
            ? 'Unavailable'
            : inCourse
              ? studentCountLabel(r.studentCount)
              : r.studentCount}
        </span>
      </label>
    );
  };

  const renderCourse = (course: Course, members: ClassRoster[]) => {
    const available = members.filter((r) => !r.loadError);
    const picked = available.filter((r) => value.classIds.includes(r.id));
    const all = available.length > 0 && picked.length === available.length;
    const some = picked.length > 0 && !all;
    const open = openById[course.id] ?? some;
    const rowKey = `row-${(indexOf.get(members[0].id) ?? 0) + 1}`;
    const listId = `${groupName}-${course.id}`;
    const off = disabled || available.length === 0;
    const sectionText = `${members.length} sections`;
    const chevron = (
      <button
        type="button"
        onClick={() => setOpenById((prev) => ({ ...prev, [course.id]: !open }))}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${open ? 'Hide' : 'Show'} sections in ${course.name}`}
        {...tourFieldAttr('assign-classes.course-expand', 'assign', rowKey)}
        className="touch-target-expand shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-blue-primary"
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
    );
    const box = (
      <Checkbox
        checked={all}
        indeterminate={some}
        disabled={off}
        onChange={() => toggleCourse(members)}
        {...tourFieldAttr('assign-classes.course', 'assign', rowKey)}
      />
    );
    return (
      <div key={course.id} data-course-group="linked">
        <div className="flex items-center gap-2 py-1.5 pl-3 pr-2">
          <label
            className={`flex min-w-0 flex-1 items-center gap-2.5 py-0.5 text-sm ${off ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {box}
            <span className="min-w-0 flex-1 font-bold text-slate-800 wrap-anywhere">
              {course.name}
            </span>
            <span className="shrink-0 text-xs text-slate-400">
              {sectionText}
            </span>
          </label>
          {chevron}
        </div>
        {open && (
          <div
            id={listId}
            role="group"
            aria-label={course.name}
            className="divide-y divide-slate-100 border-t border-slate-100"
          >
            {members.map((r) => renderRow(r, course.id))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      role={singleSelect ? 'radiogroup' : 'group'}
      aria-label="Classes"
      {...(anchor ?? tourAttr('assign-classes.trigger'))}
      className={`rounded-lg border border-slate-300 bg-white ${disabled ? 'opacity-50' : ''}`}
    >
      {rosters.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-500">
          No classes yet. Create one in My Classes or import from ClassLink to
          assign here.
        </p>
      ) : (
        <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto custom-scrollbar">
          {groups.map((g) =>
            g.course && g.rosters.length > 1
              ? renderCourse(g.course, g.rosters)
              : renderRow(g.rosters[0], null)
          )}
        </div>
      )}
      {!singleSelect && rosters.length > 1 && (
        <div className="flex justify-between border-t border-slate-200 px-3 py-1.5">
          <button
            type="button"
            onClick={selectAll}
            disabled={disabled}
            {...tourAttr('assign-classes.select-all')}
            className="text-xs font-bold text-brand-blue-primary hover:underline disabled:cursor-not-allowed disabled:no-underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => onChange(withClassIds(value, []))}
            disabled={disabled}
            {...tourAttr('assign-classes.clear')}
            className="text-xs font-bold text-slate-500 hover:underline disabled:cursor-not-allowed disabled:no-underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
