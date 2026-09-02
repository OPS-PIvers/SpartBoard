import type { ActivityWallSession, ActivityWallSubmission } from '@/types';

/** Test fixtures shared by the layout and card render tests. */
export const makeSubmission = (
  overrides: Partial<ActivityWallSubmission> = {}
): ActivityWallSubmission => ({
  id: 'sub-1',
  content: 'Hello wall',
  submittedAt: 1000,
  status: 'approved',
  type: 'text',
  participantLabel: 'Ada',
  ...overrides,
});

export const makeSession = (
  overrides: Partial<ActivityWallSession> = {}
): ActivityWallSession => ({
  id: 'teacher_wall-1',
  activityId: 'wall-1',
  teacherUid: 'teacher',
  title: 'My wall',
  prompt: 'Post something',
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  updatedAt: 0,
  layout: 'wall',
  showNames: true,
  acceptingResponses: true,
  ...overrides,
});
