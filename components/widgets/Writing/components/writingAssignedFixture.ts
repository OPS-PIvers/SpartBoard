import { createContext } from 'react';
import type { WritingAssignmentSession } from '@/types';

/** Per class key ('' for a single line): pieces turned in and waiting, and pieces returned. */
export interface WritingClassCounts {
  turnedIn: number;
  returned: number;
}

export type WritingGradingField = Pick<WritingAssignmentSession, 'grading'>;

/** Dev harness only: fixed counts and grading for the Writing Assigned tab instead of server reads. */
export const WritingAssignedFixture = createContext<{
  counts: Record<string, Record<string, WritingClassCounts>>;
  grading: Record<string, WritingGradingField>;
} | null>(null);
