// Mini Apps and Guided Learning Assigned tab rows for /library-managers-dev (dev only), built from the Quiz fixtures.
import type {
  GuidedLearningAssignment,
  MiniAppAssignment,
  QuizAssignment,
} from '@/types';
import type { AssignmentLifecycle } from '@/hooks/useAssignmentClassActions';
import {
  quizAssignedResponse,
  type AssignedResponse,
} from '@/utils/assignedStatus';
import { ASSIGNED_FIXTURES, ASSIGNED_RESPONSES } from './assignedTabFixtures';

const quizRows = ASSIGNED_FIXTURES.filter((a) => !a.paper);

const endedStatus = (a: QuizAssignment) => a.status === 'inactive';

export const MA_ASSIGNED: MiniAppAssignment[] = quizRows.map((a) => ({
  id: a.id,
  sessionId: `ma-${a.id}`,
  appId: `app-${a.id}`,
  appTitle: a.quizTitle.replace(/ Quiz$/, ' App'),
  assignmentName: a.quizTitle.replace(/ Quiz$/, ' App'),
  teacherUid: a.teacherUid,
  status: endedStatus(a) ? 'inactive' : 'active',
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  rosterIds: a.rosterIds,
  mode: a.mode === 'view-only' ? 'view-only' : 'submissions',
  resultsVersion: 2,
  scoreVisibility: a.scoreVisibility,
  periodAccess: a.periodAccess,
}));

export const GL_ASSIGNED: GuidedLearningAssignment[] = quizRows.map((a) => ({
  id: a.id,
  sessionId: a.id,
  setId: `set-${a.id}`,
  setTitle: a.quizTitle.replace(/ Quiz$/, ''),
  teacherUid: a.teacherUid,
  status: endedStatus(a) ? 'archived' : 'active',
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  rosterIds: a.rosterIds,
  assignmentMode: a.mode === 'view-only' ? 'view-only' : 'submissions',
  scoreVisibility: a.scoreVisibility,
  periodAccess: a.periodAccess,
  source: 'personal',
}));

/** The Quiz fixture responses as both kinds count them. */
export const RUN_ASSIGNED_RESPONSES: Record<string, AssignedResponse[]> =
  Object.fromEntries(
    Object.entries(ASSIGNED_RESPONSES).map(([id, rs]) => [
      id,
      rs.map(quizAssignedResponse),
    ])
  );

const asyncNoop = () => Promise.resolve();

export const NOOP_RUN_LIFECYCLE: AssignmentLifecycle = {
  end: asyncNoop,
  reopen: asyncNoop,
};
