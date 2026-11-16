// Thread A owns this file: linking suggestions, link, unlink and rename (D4, D5, D26).
import React from 'react';
import type { CourseGroup } from '@/utils/course/courseGroups';
import type { CourseRoster, CourseSectionProps } from './types';

export interface CourseLinkingProps {
  groups: CourseGroup<CourseRoster>[];
  saveCourse: CourseSectionProps['saveCourse'];
}

export const CourseLinking: React.FC<CourseLinkingProps> = () => null;
