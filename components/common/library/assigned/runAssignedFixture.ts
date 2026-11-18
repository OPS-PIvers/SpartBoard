import { createContext } from 'react';
import type { AssignedResponse } from '@/utils/assignedStatus';

/** Dev harness only: fixed responses per assignment id instead of live listeners. */
export const RunAssignedResponsesFixture = createContext<Record<
  string,
  AssignedResponse[]
> | null>(null);
