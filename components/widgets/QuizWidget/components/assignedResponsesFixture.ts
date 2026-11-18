import { createContext } from 'react';
import type { QuizResponse } from '@/types';

/** Dev harness only: fixed responses for the Assigned tab instead of live listeners. */
export const AssignedResponsesFixture = createContext<Record<
  string,
  QuizResponse[]
> | null>(null);
