// The My Classes "View Student Page" preview on fixture sessions at /class-student-page-dev (dev and auth-bypass builds only).

import React from 'react';
import type {
  ActivityWallSession,
  ActivityWallSubmission,
  ClassRoster,
  FlashcardSession,
  GuidedLearningSession,
  ProjectRun,
  VideoActivitySession,
} from '@/types';
import { ClassStudentPageView } from '@/components/classes/ClassStudentPagePreview';
import { classPreviewAssignments } from '@/hooks/useClassStudentPagePreview';
import type { SessionKind } from '@/hooks/useStudentAssignments';
import type { StudentPagePreviewItem } from '@/utils/studentPagePreviewLoad';
import { buildStudentViewSession } from '@/utils/quizStudentViewSession';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import { makeQuizData } from './sessionViewsMocks';
import {
  FIXTURE_CLASS_PAGES,
  fixtureEmbedUrl,
} from './classPageAgendaFixtures';

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

const CELL_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="#f1f5f9"/><ellipse cx="400" cy="225" rx="300" ry="170" fill="#bbf7d0" stroke="#15803d" stroke-width="6"/><circle cx="400" cy="225" r="70" fill="#a78bfa" stroke="#5b21b6" stroke-width="5"/></svg>'
)}`;

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
  }),
  doc('activity-wall', 'aw-1', { title: 'Exit Ticket Wall' }),
  doc('flashcards', 'fc-1', {
    status: 'active',
    kind: 'study',
    title: 'Spanish Vocab Week 6',
  }),
  doc('projects', 'pj-1', { title: 'Ecosystem Poster' }),
  doc('quiz', 'q-ended', {
    status: 'ended',
    quizTitle: 'Unit 3 Test',
    endedAt: now - 72 * HOUR,
  }),
];

const item = (id: string): StudentPagePreviewItem | null => {
  switch (id) {
    case 'q-live':
    case 'q-due':
    case 'q-ended':
      return {
        kind: 'quiz',
        view: {
          session: buildStudentViewSession(
            makeQuizData(),
            DEFAULT_QUIZ_BEHAVIOR,
            false
          ),
        },
      };
    case 'va-1':
      return {
        kind: 'video-activity',
        session: {
          id,
          activityTitle: 'How Volcanoes Form',
          youtubeUrl: 'https://www.youtube.com/watch?v=lAmqsMQG3RM',
          publicQuestions: [
            {
              id: 'v1',
              timestamp: 5,
              text: 'What is magma?',
              type: 'MC',
              options: ['Melted rock', 'Ice', 'Sand'],
            },
          ],
          settings: { autoPlay: false, allowSkipping: true },
        } as unknown as VideoActivitySession,
        key: [],
      };
    case 'gl-1':
      return {
        kind: 'guided-learning',
        session: {
          id,
          title: 'Parts of a Cell',
          mode: 'structured',
          imageUrls: [CELL_IMAGE],
          publicSteps: [
            {
              id: 's1',
              xPct: 50,
              yPct: 50,
              imageIndex: 0,
              interactionType: 'text-popover',
              text: 'This is the nucleus. It holds the cell’s DNA.',
              showOverlay: 'none',
            },
          ],
          createdAt: now,
        } as unknown as GuidedLearningSession,
      };
    case 'ma-1':
      return {
        kind: 'mini-app',
        title: 'Multiplication Race',
        html: '<body style="font-family:sans-serif;padding:24px"><h1>7 × 8 = ?</h1><input><button>Check</button></body>',
        manifest: { questions: [] },
        answerKey: { questions: {} },
      };
    case 'aw-1':
      return {
        kind: 'activity-wall',
        session: {
          id,
          title: 'Exit Ticket Wall',
          prompt: 'One thing you learned today',
          layout: 'wall',
          mode: 'text',
        } as unknown as ActivityWallSession,
        posts: [
          {
            id: 'p1',
            content: 'Plants make food from sunlight.',
            status: 'approved',
            submittedAt: now - HOUR,
          },
          {
            id: 'p2',
            content: 'Volcanoes form where plates meet.',
            status: 'approved',
            submittedAt: now - 2 * HOUR,
          },
        ] as unknown as ActivityWallSubmission[],
      };
    case 'fc-1':
      return {
        kind: 'flashcards',
        session: {
          id,
          title: 'Spanish Vocab Week 6',
          kind: 'study',
          cards: [
            { id: 'c1', term: 'la playa', definition: 'the beach' },
            { id: 'c2', term: 'el libro', definition: 'the book' },
            { id: 'c3', term: 'la mesa', definition: 'the table' },
          ],
        } as unknown as FlashcardSession,
      };
    case 'pj-1':
      return {
        kind: 'projects',
        run: {
          id,
          title: 'Ecosystem Poster',
          dueAt: now + 96 * HOUR,
          steps: [
            { id: 'st1', title: 'Pick an ecosystem' },
            { id: 'st2', title: 'Find three sources' },
            { id: 'st3', title: 'Draft the poster' },
          ],
        } as unknown as ProjectRun,
      };
    default:
      return null;
  }
};

export const ClassStudentPageDevHarness: React.FC = () => (
  <ClassStudentPageView
    roster={ROSTER}
    teacherName="Paul Ivers"
    status="ready"
    assignments={classPreviewAssignments(DOCS, CLASS_ID)}
    tabAwayTimerOn={false}
    onClose={() => undefined}
    loadItem={(_kind, sessionId) => Promise.resolve(item(sessionId))}
    classPage={
      new URLSearchParams(window.location.search).get('agenda') === '1'
        ? FIXTURE_CLASS_PAGES.bio
        : undefined
    }
    agendaEmbedUrlFor={fixtureEmbedUrl}
    sectionPicker={
      new URLSearchParams(window.location.search).get('sections') === '1'
        ? {
            sections: [
              ROSTER,
              { ...ROSTER, id: 'r2', name: 'Sample - Mock Period 3 (TEST)' },
            ],
            value: ROSTER.id,
            onChange: () => undefined,
          }
        : undefined
    }
  />
);
