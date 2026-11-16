// Courses in My Classes behind the course-agenda flag (docs/plans/COURSE_AND_AGENDA.md D3); threads A, B and E fill the three parts.
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { courseGroups } from '@/utils/course/courseGroups';
import { AgendaSetup } from './AgendaSetup';
import { CourseLinking } from './CourseLinking';
import { FamilyLinkSetup } from './FamilyLinkSetup';
import type { CourseSectionProps } from './types';

export const CourseSection: React.FC<CourseSectionProps> = ({
  rosters,
  courses,
  saveCourse,
}) => {
  const { t } = useTranslation();
  const groups = useMemo(
    () => courseGroups(courses, rosters),
    [courses, rosters]
  );
  if (rosters.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
        {t('course.title', { defaultValue: 'Courses' })}
      </h3>
      <CourseLinking groups={groups} saveCourse={saveCourse} />
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {groups.map((group) => (
          <li
            key={group.course?.id ?? `roster-${group.rosters[0].id}`}
            className="py-2.5 px-1 space-y-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-700 truncate">
                {group.course?.name ?? group.rosters[0].name}
              </p>
              {group.rosters.length > 1 && (
                <p className="text-xs text-slate-500 truncate">
                  {group.rosters.map((r) => r.name).join(', ')}
                </p>
              )}
            </div>
            <AgendaSetup group={group} saveCourse={saveCourse} />
            <FamilyLinkSetup group={group} saveCourse={saveCourse} />
          </li>
        ))}
      </ul>
    </section>
  );
};
