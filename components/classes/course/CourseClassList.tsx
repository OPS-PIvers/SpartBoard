// My Classes roster list grouped by Course behind the course-agenda flag (D1, D3); threads A, B and E fill the stubs it renders.
import React, { Fragment, useMemo } from 'react';
import { courseGroups } from '@/utils/course/courseGroups';
import { AgendaSetup } from './AgendaSetup';
import { CourseGroupActions } from './CourseGroupActions';
import { CourseLinking } from './CourseLinking';
import { FamilyLinkSetup } from './FamilyLinkSetup';
import type { CourseClassListProps, CourseRoster } from './types';

export function CourseClassList<R extends CourseRoster>({
  rosters,
  courses,
  saveCourse,
  renderRow,
  listAttrs,
}: CourseClassListProps<R>): React.ReactElement {
  const groups = useMemo(
    () => courseGroups(courses, rosters),
    [courses, rosters]
  );
  const indexOf = useMemo(
    () => new Map(rosters.map((r, i) => [r.id, i])),
    [rosters]
  );
  return (
    <>
      <CourseLinking groups={groups} saveCourse={saveCourse} />
      <ul
        className="divide-y divide-slate-200 border-y border-slate-200"
        {...listAttrs}
      >
        {groups.map((group) => {
          const linked = group.course !== null && group.rosters.length > 1;
          return (
            <li
              key={group.course?.id ?? `roster-${group.rosters[0].id}`}
              data-course-group={linked ? 'linked' : 'single'}
            >
              {linked && (
                <p className="px-1 pt-2 text-xs font-bold text-slate-500 break-words">
                  {group.course?.name}
                </p>
              )}
              <ul
                className={`divide-y divide-slate-200 ${linked ? 'pl-3' : ''}`}
              >
                {group.rosters.map((r) => (
                  <Fragment key={r.id}>
                    {renderRow(r, indexOf.get(r.id) ?? 0)}
                  </Fragment>
                ))}
              </ul>
              <CourseGroupActions group={group} saveCourse={saveCourse} />
              <AgendaSetup group={group} saveCourse={saveCourse} />
              <FamilyLinkSetup group={group} saveCourse={saveCourse} />
            </li>
          );
        })}
      </ul>
    </>
  );
}
