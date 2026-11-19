import { createContext } from 'react';
import type { Course } from '@/utils/course/contract';

/** Harness and test override for the Courses the Classes step groups by. */
export const ClassChecklistCoursesContext = createContext<
  readonly Course[] | null
>(null);
