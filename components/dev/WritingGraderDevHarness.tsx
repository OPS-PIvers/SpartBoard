// `/writing-grader-dev?view=results|grader|student|table[&structure=1]&grading=points|rubric|dreamhome|ungraded[&v2=1][&order=low-first][&jump=1][&opennext=0]`: Writing results, grader and feedback on fixtures.
import React, { useMemo, useState } from 'react';
import type {
  Rubric,
  RubricLevelOrder,
  WritingGrading,
  WritingResponse,
  WritingResponseStatus,
} from '@/types';
import { DashboardContext } from '@/context/DashboardContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import { DialogProvider } from '@/context/DialogContext';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import { mockAuth } from '@/components/student/studentMocks';
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
import { buildWritingRecordSample } from './writingRecordSample';
import { RubricBuilderPanel } from '@/components/widgets/QuizWidget/components/RubricBuilderPanel';
import { RubricTableModal } from '@/components/widgets/QuizWidget/components/RubricTableModal';

const noop = () => undefined;
const RECORD = buildWritingRecordSample();
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

const level = (
  id: string,
  label: string,
  points: number,
  description = ''
) => ({
  id,
  label,
  points,
  ...(description ? { description } : {}),
});

const DBQ = {
  id: 'r-dbq',
  title: 'Unit 1 & 2 DBQ Scoring Guide',
  description:
    '6-point DBQ rubric (synthesis/complexity not assessed). Grade conversion: 6 = 100%, 5 = 96%, 4 = 86%, 3 = 76%, 2 = 66%, 1 = 56%, 0 = 50%.',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'context',
      name: 'A. Contextualization',
      description:
        'Describes a broader historical context relevant to the prompt and connects it to the topic.',
      levels: [
        level(
          'ctx1',
          'Earned',
          1,
          'Names specific events from right before or around the topic and connects them to the thesis.'
        ),
        level(
          'ctx0',
          'Not yet',
          0,
          'Context is too broad, too short, or not linked to the thesis.'
        ),
      ],
    },
    {
      id: 'evidence',
      name: 'B. Evidence from documents',
      levels: [
        level(
          'ev3',
          'Supports argument',
          3,
          'Uses at least four documents to support an argument.'
        ),
        level(
          'ev2',
          'Describes',
          2,
          'Describes the content of at least three documents.'
        ),
        level('ev0', 'Not yet', 0),
      ],
    },
    {
      id: 'sourcing',
      name: 'C. Sourcing',
      levels: [
        level(
          'so2',
          'Earned',
          2,
          'Explains how purpose or audience is relevant for at least two documents.'
        ),
        level('so0', 'Not yet', 0),
      ],
    },
  ],
} as unknown as Rubric;

const DREAM_HOME = {
  id: 'r-dream',
  title: 'Dream home presentation',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'design',
      name: 'Physical Design of Dream Home',
      description:
        'Student has spent much time and effort in producing a fantastic home design. Design looks finished and polished, is of high quality, and is easy to read.',
      levels: [
        level('d0', 'Below Proficiency', 0),
        level(
          'd2',
          'Approaching Proficiency',
          2,
          'Student has not spent any time or effort producing the home design; it is last minute. Design is difficult to read.'
        ),
        level(
          'd3',
          'Meets Proficiency',
          3,
          'Student has spent some time and effort producing a home design. Design is lacking details or quality, or may not be easy to read.'
        ),
        level(
          'd4',
          'Exceeds Proficiency',
          4,
          'Student has spent much time and effort producing a fantastic home design. Design looks finished and polished, is of high quality, and is easy to read.'
        ),
      ],
    },
    {
      id: 'vocab',
      name: 'Vocabulary and Grammar Requirements',
      description:
        'At least 6 rooms are included and labeled, with at least 2 items labeled per room. German contains minimal errors.',
      levels: [
        level('v0', 'Below Proficiency', 0),
        level(
          'v5',
          'Approaching Proficiency',
          5,
          '2 or fewer rooms are included or labeled. Rooms do not have 2 items included and labeled. German contains many errors.'
        ),
        level(
          'v8',
          'Meets Proficiency',
          8,
          '3 to 5 rooms are included and labeled, or rooms have fewer than 2 items included and labeled. German contains some errors.'
        ),
        level(
          'v10',
          'Exceeds Proficiency',
          10,
          'At least 6 rooms are included and labeled, with at least 2 items per room. German contains minimal errors.'
        ),
      ],
    },
    {
      id: 'oral',
      name: 'Oral Tour of the Home (pronunciation, fluency and pacing)',
      levels: [
        level('o0', 'Below Proficiency', 0),
        level(
          'o3',
          'Approaching Proficiency',
          3,
          'Frequent pauses; pronunciation often gets in the way.'
        ),
        level(
          'o5',
          'Meets Proficiency',
          5,
          'Some pauses; mostly clear pronunciation.'
        ),
        level('o6', 'Exceeds Proficiency', 6, 'Smooth and clear throughout.'),
      ],
    },
    {
      id: 'prepositions',
      name: 'Use of Prepositions',
      levels: [
        level('p0', 'Below Proficiency', 0),
        level('p2', 'Approaching Proficiency', 2),
        level('p4', 'Meets Proficiency', 4),
        level('p5', 'Exceeds Proficiency', 5),
      ],
    },
  ],
} as Rubric;

const GRADINGS: Record<string, WritingGrading> = {
  points: { mode: 'points', points: 20 },
  rubric: { mode: 'rubric', rubricId: 'r1', rubricSnapshot: RUBRIC },
  dreamhome: {
    mode: 'rubric',
    rubricId: 'r-dream',
    rubricSnapshot: DREAM_HOME,
  },
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
  const v2 = params.get('v2') === '1';
  const [rubricLevelOrder, setRubricLevelOrder] = useState<RubricLevelOrder>(
    params.get('order') === 'low-first' ? 'low-first' : 'high-first'
  );
  const [rubricAutoAdvance, setRubricAutoAdvance] = useState(
    params.get('jump') === '1'
  );
  const [rubricOpenNext, setRubricOpenNext] = useState(
    params.get('opennext') !== '0'
  );
  const auth = useMemo<AuthContextType | undefined>(
    () =>
      v2
        ? {
            ...mockAuth,
            canAccessFeature: (id) => id === 'rubric-grading-v2',
            rubricLevelOrder,
            rubricAutoAdvance,
            rubricOpenNext,
            updateAccountPreferences: (u) => {
              if (u.rubricLevelOrder) setRubricLevelOrder(u.rubricLevelOrder);
              if (u.rubricAutoAdvance !== undefined)
                setRubricAutoAdvance(u.rubricAutoAdvance);
              if (u.rubricOpenNext !== undefined)
                setRubricOpenNext(u.rubricOpenNext);
              return Promise.resolve();
            },
          }
        : undefined,
    [v2, rubricLevelOrder, rubricAutoAdvance, rubricOpenNext]
  );
  const responses = NAMES.flatMap(([uid, , , status]) =>
    status ? [response(uid, status, grading)] : []
  );
  const rows = buildWritingRows(
    responses,
    new Map(NAMES.map(([uid, g, f]) => [uid, { givenName: g, familyName: f }]))
  );
  const gradable = rows.filter(isGradable);
  const draftsByStudent = useMemo(
    () =>
      new Map(
        gradable.map((r) => [
          r.studentUid,
          r.studentUid === 'u1'
            ? [draft('2', 2, false, max), draft('1', 1, true, max)]
            : [draft('1', 1, r.studentUid !== 'u5', max)],
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fixtures are fixed per page load
    [max]
  );
  const session = {
    id: 's1',
    title: 'Personal narrative: a moment that changed you',
    prompt:
      'Write about a moment that changed you. Show how you felt, not just what happened.',
    grading,
    studentCanViewRecord: false,
  };

  return (
    <AuthContext.Provider value={auth}>
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
              rows={gradable}
              initialUid="u1"
              draftsByStudent={draftsByStudent}
              teacherUid="t"
              onSaveFeedback={() => Promise.resolve({ counts: true })}
              onReturn={() => Promise.resolve()}
              onClose={noop}
              recordFixture={() => RECORD}
            />
          )}
          {view === 'builder' && (
            <RubricBuilderPanel
              questionId="q1"
              existingSnapshot={
                params.get('rubric') === 'dbq' ? DBQ : undefined
              }
              onAttach={noop}
              onDetach={noop}
              onClose={noop}
              teacherUid="mock-user-id"
            />
          )}
          {view === 'table' && (
            <RubricTableModal
              rubric={params.get('rubric') === 'dbq' ? DBQ : DREAM_HOME}
              order={rubricLevelOrder}
              onOrderChange={() =>
                setRubricLevelOrder((o) =>
                  o === 'high-first' ? 'low-first' : 'high-first'
                )
              }
              scores={new Map()}
              onClose={noop}
              onSave={() => Promise.resolve()}
              initialEditing={params.get('structure') === '1'}
              editStructure={params.get('structure') === '1'}
              editLevels={params.get('levels') === '1'}
              saveLabel={params.get('structure') === '1' ? 'Done' : 'Save'}
            />
          )}
          <DialogContainer />
        </DialogProvider>
      </DashboardContext.Provider>
    </AuthContext.Provider>
  );
};
