// `/writing-grader-dev?view=results|grader|student&grading=points|rubric|ungraded`: Writing results, grader and returned feedback on fixtures.
import React, { useMemo, useState } from 'react';
import type {
  Rubric,
  WritingGrading,
  WritingResponse,
  WritingResponseStatus,
} from '@/types';
import { DashboardContext } from '@/context/DashboardContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { DialogContainer } from '@/components/common/DialogContainer';
import { WritingResultsView } from '@/components/widgets/Writing/components/results/WritingResultsView';
import { WritingGrader } from '@/components/widgets/Writing/components/results/WritingGrader';
import { WritingReturnedFeedbackView } from '@/components/student/writing/WritingReturnedFeedback';
import type { WritingDraftWithId } from '@/hooks/useWritingResults';
import {
  buildWritingRows,
  isGradable,
  writingMaxPoints,
} from '@/utils/writingGrading';

const noop = () => undefined;
const T0 = Date.UTC(2026, 10, 14, 15, 2);

const RUBRIC = {
  id: 'r1',
  name: 'Narrative',
  criteria: [
    {
      id: 'ideas',
      name: 'Ideas',
      levels: [
        { id: 'i1', label: 'Beginning', points: 1 },
        { id: 'i2', label: 'Developing', points: 2 },
        { id: 'i3', label: 'Proficient', points: 3 },
        { id: 'i4', label: 'Advanced', points: 4 },
      ],
    },
    {
      id: 'org',
      name: 'Organization',
      levels: [
        { id: 'o1', label: 'Beginning', points: 1 },
        { id: 'o2', label: 'Developing', points: 2 },
        { id: 'o3', label: 'Proficient', points: 3 },
        { id: 'o4', label: 'Advanced', points: 4 },
      ],
    },
  ],
} as unknown as Rubric;

const GRADINGS: Record<string, WritingGrading> = {
  points: { mode: 'points', points: 20 },
  rubric: { mode: 'rubric', rubricId: 'r1', rubricSnapshot: RUBRIC },
  ungraded: { mode: 'ungraded' },
};

const HTML = `<p>The summer I turned eleven, my grandfather taught me to fix a bicycle chain in his garage. I thought it would take five minutes. It took all afternoon.</p><p>He never once took the wrench from my hands. When the chain slipped for the third time, I wanted to quit, but he only said, "Again." By the time the streetlights came on, the chain held and so did something in me.</p><p>Now, whenever something feels too hard, I hear that one word. It reminds me that patience is a skill you practice, not something you are born with.</p>`;

const NAMES: Array<[string, string, string, WritingResponseStatus | null]> = [
  ['u1', 'Maya', 'Okonkwo-Fitzgerald', 'turned-in'],
  ['u2', 'Liam', 'Chen', 'returned'],
  ['u3', 'Ava', 'Martinez', 'revising'],
  ['u4', 'Noah', 'Johnson', 'draft'],
  ['u5', 'Zoë', 'Abernathy', 'turned-in'],
  ['u6', 'Eli', 'Nguyen', null],
];

const response = (
  uid: string,
  status: WritingResponseStatus,
  grading: WritingGrading
): WritingResponse => {
  const max = writingMaxPoints(grading);
  const drafts = uid === 'u1' ? 2 : status === 'draft' ? 0 : 1;
  return {
    studentUid: uid,
    classId: 'c1',
    html: HTML,
    summary: {
      wordCount: 112,
      savedAt: T0,
      writingMs: 1_800_000,
      sessions: 2,
      pasteCount: 0,
      pastedChars: 0,
      untypedCount: 0,
      untypedChars: 0,
      awayMs: 0,
      awayCount: 0,
    },
    status,
    saveCount: 40,
    tabId: 't',
    logChunk: 0,
    startedAt: T0 - 86_400_000,
    draftCount: drafts,
    draftSeq: drafts,
    ...(drafts > 0 ? { latestDraftId: String(drafts), turnedInAt: T0 } : {}),
    ...(status === 'returned' && max !== null
      ? {
          returnedAt: T0 + 3_600_000,
          grade: {
            draftId: '1',
            draftNumber: 1,
            pointsAwarded: Math.round(max * 0.85),
            maxPoints: max,
            gradedAt: T0,
          },
        }
      : {}),
    updatedAt: T0,
  };
};

const draft = (
  id: string,
  number: number,
  returned: boolean,
  max: number | null
): WritingDraftWithId => ({
  id,
  number,
  seq: number,
  html: HTML,
  summary: response('x', 'turned-in', { mode: 'ungraded' }).summary,
  turnedInAt: T0 - (2 - number) * 86_400_000,
  turnedInBy: 'student',
  logMark: { chunk: 0, length: 0 },
  ...(returned
    ? {
        returnedAt: T0,
        returnKind: 'revision' as const,
        feedback: {
          overallComment:
            'Your opening pulls me right in. Show more of how you felt when you wanted to quit.',
          annotations: [
            {
              id: 'a1',
              from: 0,
              to: 69,
              comment: 'Strong first line.',
              highlightColor: 'green',
              authorUid: 't',
              createdAt: T0,
            },
          ],
          ...(max !== null ? { pointsAwarded: max === 8 ? 5 : max - 4 } : {}),
          gradedBy: 't',
          gradedAt: T0,
        },
        ...(max !== null
          ? {
              grade: {
                draftId: id,
                draftNumber: number,
                ...(max === 8
                  ? {
                      rubricScores: [
                        { criterionId: 'ideas', levelId: 'i3', points: 3 },
                        { criterionId: 'org', levelId: 'o2', points: 2 },
                      ],
                    }
                  : {}),
                pointsAwarded: max === 8 ? 5 : max - 4,
                maxPoints: max,
                gradedAt: T0,
              },
            }
          : {}),
      }
    : {}),
});

export const WritingGraderDevHarness: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') ?? 'results';
  const grading =
    GRADINGS[params.get('grading') ?? 'points'] ?? GRADINGS.points;
  const max = writingMaxPoints(grading);
  const dashboard = useMemo(
    () =>
      ({
        toasts: [],
        addToast: noop,
        removeToast: noop,
      }) as unknown as DashboardContextValue,
    []
  );
  const responses = NAMES.flatMap(([uid, , , status]) =>
    status ? [response(uid, status, grading)] : []
  );
  const rows = buildWritingRows(
    responses,
    new Map(NAMES.map(([uid, g, f]) => [uid, { givenName: g, familyName: f }]))
  );
  const [selected, setSelected] = useState('u1');
  const drafts =
    selected === 'u1'
      ? [draft('2', 2, false, max), draft('1', 1, true, max)]
      : [draft('1', 1, selected !== 'u5', max)];
  const session = {
    id: 's1',
    title: 'Personal narrative: a moment that changed you',
    grading,
    studentCanViewRecord: false,
  };

  return (
    <DashboardContext.Provider value={dashboard}>
      <DialogProvider>
        <div className="flex h-screen [height:100dvh] items-start justify-center overflow-y-auto bg-slate-700 p-8 pb-16">
          {view === 'student' ? (
            <div className="w-full max-w-3xl">
              <WritingReturnedFeedbackView
                drafts={[draft('2', 2, true, max), draft('1', 1, true, max)]}
                grading={grading}
              />
            </div>
          ) : (
            <div
              className="overflow-hidden rounded-2xl bg-white shadow-xl"
              style={{
                width: Number(params.get('w') ?? 640),
                height: Number(params.get('h') ?? 480),
                containerType: 'size',
              }}
            >
              <WritingResultsView
                title={session.title}
                rows={rows}
                maxPoints={max}
                loading={false}
                error={false}
                onBack={noop}
                onGrade={noop}
              />
            </div>
          )}
        </div>
        {view === 'grader' && (
          <WritingGrader
            session={session}
            rows={rows.filter(isGradable)}
            selectedUid={selected}
            onSelect={setSelected}
            drafts={drafts}
            draftsLoading={false}
            teacherUid="t"
            onSaveFeedback={() => Promise.resolve({ counts: true })}
            onReturn={() => Promise.resolve()}
            onClose={noop}
          />
        )}
        <DialogContainer />
      </DialogProvider>
    </DashboardContext.Provider>
  );
};
