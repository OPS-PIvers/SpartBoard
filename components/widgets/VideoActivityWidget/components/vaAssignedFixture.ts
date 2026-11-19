import { createContext } from 'react';
import type { VideoActivityQuestion, VideoActivityResponse } from '@/types';

/** Dev harness only: fixed responses and answer keys for the Assigned tab instead of Firestore. */
export const VaAssignedFixture = createContext<{
  responses: Record<string, VideoActivityResponse[]>;
  questions: Record<string, VideoActivityQuestion[]>;
} | null>(null);
