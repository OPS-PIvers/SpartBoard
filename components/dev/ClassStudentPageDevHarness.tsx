// The My Classes "View Student Page" preview on fixture sessions at /class-student-page-dev (dev and auth-bypass builds only).

import React from 'react';
import type { ClassRoster } from '@/types';
import { ClassStudentPageView } from '@/components/classes/ClassStudentPagePreview';
import { classPreviewAssignments } from '@/hooks/useClassStudentPagePreview';
import type { SessionKind } from '@/hooks/useStudentAssignments';

const CLASS_ID = 'mock-period-1';
const HOUR = 60 * 60 * 1000;
const now = Date.now();

const ROSTER = {
  id: 'r1',
  name: 'Sample - Mock Period 1 (TEST)',
  driveFileId: null,
  studentCount: 10,
  createdAt: now,
  students: [],
  testClassId: CLASS_ID,
} as unknown as ClassRoster;

const doc = (kind: SessionKind, id: string, data: Record<string, unknown>) => ({
  kind,
  id,
  data: { classIds: [CLASS_ID], createdAt: now - HOUR, ...data },
});

const DOCS = [
  doc('quiz', 'q-live', {
    status: 'active',
    sessionMode: 'teacher',
    quizTitle: 'Unit 4 Check: Fractions',
    code: 'FRAC4',
  }),
  doc('quiz', 'q-due', {
    status: 'active',
    sessionMode: 'student',
    quizTitle: 'Decimals Practice',
    code: 'DEC22',
    dueAt: now + 26 * HOUR,
  }),
  doc('video-activity', 'va-1', {
    status: 'active',
    activityTitle: 'How Volcanoes Form',
    dueAt: now + 72 * HOUR,
  }),
  doc('guided-learning', 'gl-1', { title: 'Parts of a Cell' }),
  doc('mini-app', 'ma-1', {
    status: 'active',
    appTitle: 'Multiplication Race',
    openAt: now + 48 * HOUR,
  }),
  doc('flashcards', 'fc-1', {
    status: 'active',
    kind: 'study',
    title: 'Spanish Vocab Week 6',
  }),
  doc('quiz', 'q-ended', {
    status: 'ended',
    quizTitle: 'Unit 3 Test',
    endedAt: now - 72 * HOUR,
  }),
];

export const ClassStudentPageDevHarness: React.FC = () => (
  <ClassStudentPageView
    roster={ROSTER}
    teacherName="Paul Ivers"
    status="ready"
    assignments={classPreviewAssignments(DOCS, CLASS_ID)}
    quizViewOn
    tabAwayTimerOn={false}
    onClose={() => undefined}
  />
);
