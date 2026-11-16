// Thread A owns this file: the linking suggestions shown above the class list (D4).
import React from 'react';
import type { CourseGroup } from '@/utils/course/courseGroups';
import type { CourseRoster, CourseGroupProps } from './types';

export interface CourseLinkingProps {
  groups: CourseGroup<CourseRoster>[];
  saveCourse: CourseGroupProps['saveCourse'];
}

export const CourseLinking: React.FC<CourseLinkingProps> = () => null;
