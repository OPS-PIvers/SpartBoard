// My Classes list behind the course-agenda flag: a linked Course is one row (D3); threads A, B and E fill the stubs it renders.
import React, { Fragment, useMemo, useState } from 'react';
import { courseGroups } from '@/utils/course/courseGroups';
import { AgendaSetup } from './AgendaSetup';
import { CourseEditButton, CourseEditor } from './CourseGroupActions';
import { CourseLinking } from './CourseLinking';
import { CourseRow } from './CourseRow';
import { FamilyLinkSetup } from './FamilyLinkSetup';
import type { CourseClassListProps, CourseRoster } from './types';

/** Course ids never hold a space, so this can't match one. */
const LINK_EDITOR = ' link';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <>
      <CourseLinking
        groups={groups}
        saveCourse={saveCourse}
        editing={editingId === LINK_EDITOR}
        onEditingChange={(open) => setEditingId(open ? LINK_EDITOR : null)}
      />
      <ul
        className="divide-y divide-slate-200 border-y border-slate-200"
        {...listAttrs}
      >
        {groups.map((group) => {
          const linked = group.course !== null && group.rosters.length > 1;
          const rowKey = `row-${(indexOf.get(group.rosters[0].id) ?? 0) + 1}`;
          const courseId = linked ? (group.course?.id ?? null) : null;
          const editing = courseId !== null && editingId === courseId;
          return (
            <li
              key={group.course?.id ?? `roster-${group.rosters[0].id}`}
              data-course-group={linked ? 'linked' : 'single'}
            >
              {linked && group.course ? (
                <>
                  <CourseRow
                    group={group}
                    rowKey={rowKey}
                    renderSection={(r) => renderRow(r, indexOf.get(r.id) ?? 0)}
                    actions={
                      <CourseEditButton
                        rowKey={rowKey}
                        courseName={group.course.name}
                        open={editing}
                        onClick={() => setEditingId(editing ? null : courseId)}
                      />
                    }
                  />
                  {editing && (
                    <CourseEditor
                      key={group.course.id}
                      groups={groups}
                      course={group.course}
                      saveCourse={saveCourse}
                      onDone={() => setEditingId(null)}
                    />
                  )}
                </>
              ) : (
                <ul>
                  {group.rosters.map((r) => (
                    <Fragment key={r.id}>
                      {renderRow(r, indexOf.get(r.id) ?? 0)}
                    </Fragment>
                  ))}
                </ul>
              )}
              <AgendaSetup group={group} saveCourse={saveCourse} />
              <FamilyLinkSetup group={group} saveCourse={saveCourse} />
            </li>
          );
        })}
      </ul>
    </>
  );
}
