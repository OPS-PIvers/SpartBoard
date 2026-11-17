import { createContext } from 'react';
import type { Course } from '@/utils/course/contract';

/** The widget grader harness has no Course listener or Google sign-in: its Courses and a stand-in slide. Null everywhere else. */
export const AgendaFixtureContext = createContext<{
  courses: Course[];
  deckSrcDoc: string;
} | null>(null);
