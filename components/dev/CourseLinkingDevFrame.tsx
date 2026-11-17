// The My Classes list with Courses on fixture data, for /sidebar-lists-dev; saves change local state only.
import React, { useCallback, useState } from 'react';
import { CourseClassList } from '@/components/classes/course/CourseClassList';
import { SidebarClassRow } from '@/components/layout/sidebar/SidebarClassRow';
import type { ClassRoster } from '@/types';
import type {
  Course,
  SaveCourseReply,
  SaveCourseRequest,
} from '@/utils/course/contract';

const NOW = Date.UTC(2026, 10, 16);

const cl = (
  id: string,
  subject: string,
  title: string,
  code: string,
  count: number
): ClassRoster => ({
  id,
  name: `${subject} - ${title} (${code})`,
  driveFileId: null,
  studentCount: count,
  createdAt: NOW,
  students: Array.from({ length: count }, (_, i) => ({
    id: `${id}-${i}`,
    firstName: 'Student',
    lastName: String(i + 1),
    pin: String(100 + i),
  })),
  classlinkClassId: `cl-${id}`,
  classlinkSubject: subject,
  classlinkClassCode: code,
});

const ROSTERS: ClassRoster[] = [
  cl('e1', 'English', 'English 9', 'ENG9-01', 27),
  cl('e2', 'English', 'English 9', 'ENG9-03', 29),
  cl('e3', 'English', 'English 9', 'ENG9-05', 25),
  cl('s1', 'Social Studies', 'World History', 'WH-02', 31),
  cl('s2', 'Social Studies', 'World History', 'WH-04', 30),
  cl('s3', 'Social Studies', 'World History', 'WH-06', 28),
  cl('j1', 'Electives', 'Journalism', 'JRN-07', 18),
];

const base = (id: string, name: string, rosterIds: string[]): Course => ({
  id,
  name,
  teacherName: 'Mock Teacher',
  rosterIds,
  agenda: null,
  pinnedLinks: [],
  familyLink: null,
  linkId: `link-${id}`,
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: NOW,
  updatedAt: NOW,
});

const INITIAL: Course[] = [base('c-wh', 'World History', ['s1', 's2', 's3'])];

let nextId = 1;

function apply(courses: Course[], req: SaveCourseRequest): Course[] {
  if (req.action === 'unlink') {
    const c = courses.find((x) => x.id === req.courseId);
    const r = ROSTERS.find((x) => x.id === req.rosterId);
    if (!c || !r) return courses;
    return [
      ...courses.map((x) =>
        x.id === c.id
          ? { ...x, rosterIds: x.rosterIds.filter((id) => id !== r.id) }
          : x
      ),
      { ...base(`c-${nextId++}`, r.name, [r.id]), agenda: c.agenda },
    ];
  }
  if (req.action !== 'save') return courses;
  const input = req.course;
  const ids = input.rosterIds;
  const stripped = ids
    ? courses
        .filter((x) => x.id !== input.id)
        .map((x) => ({
          ...x,
          rosterIds: x.rosterIds.filter((id) => !ids.includes(id)),
        }))
        .filter((x) => x.rosterIds.length > 0)
    : courses.filter((x) => x.id !== input.id);
  const prev = courses.find((x) => x.id === input.id);
  const next: Course = {
    ...(prev ?? base(`c-${nextId++}`, '', [])),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(ids ? { rosterIds: ids } : {}),
    updatedAt: Date.now(),
  };
  return [...stripped, next];
}

export const CourseLinkingDevFrame: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>(INITIAL);
  const [active, setActive] = useState<string | null>('e2');
  const saveCourse = useCallback(
    async (req: SaveCourseRequest): Promise<SaveCourseReply> => {
      await new Promise((r) => setTimeout(r, 300));
      setCourses((prev) => apply(prev, req));
      return {
        courseId: null,
        rostersWithoutClassPage: [],
        classLinkUnavailable: false,
      };
    },
    []
  );
  return (
    <div className="p-5 space-y-3">
      <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
        Your Classes
      </h3>
      <CourseClassList
        rosters={ROSTERS}
        courses={courses}
        saveCourse={saveCourse}
        renderRow={(r, i) => (
          <SidebarClassRow
            key={r.id}
            roster={r}
            isActive={active === r.id}
            classLinkEnabled
            rowKey={`row-${i + 1}`}
            onToggleActive={() => setActive(active === r.id ? null : r.id)}
            onEdit={() => undefined}
            onSyncClassLink={() => undefined}
            onLinkClassroom={() => undefined}
            onDelete={() => undefined}
          />
        )}
      />
    </div>
  );
};
