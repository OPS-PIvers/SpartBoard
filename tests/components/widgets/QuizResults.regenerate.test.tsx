import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizResponse } from '@/types';

// Minimal hook stubs — QuizResults's render path reaches into useDashboard,
// useAuth, usePlcs, useAssignmentPseudonyms, and useClickOutside. We mock
// each at module-scope so the focused recovery test stays self-contained.
const addToast = vi.fn();
const updateWidget = vi.fn();
const addWidget = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    updateWidget,
    addWidget,
    addToast,
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    googleAccessToken: 'token-1',
    user: { uid: 'user-1' },
    orgId: null,
  }),
}));
const clearPlcSharedSheetUrl = vi.fn().mockResolvedValue(undefined);
const setPlcSharedSheetUrl = vi
  .fn()
  .mockResolvedValue(
    'https://docs.google.com/spreadsheets/d/regenerated-sheet-id'
  );
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [
      {
        id: 'plc-1',
        name: 'Test PLC',
        leadUid: 'user-1',
        memberUids: ['user-1', 'user-2'],
        memberEmails: {
          'user-1': 'self@example.com',
          'user-2': 'b@example.com',
        },
        sharedSheetUrl: 'https://docs.google.com/spreadsheets/d/stale-sheet-id',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    clearPlcSharedSheetUrl,
    setPlcSharedSheetUrl,
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonyms: () => ({ byStudentUid: new Map() }),
}));
vi.mock('@/hooks/useClickOutside', () => ({ useClickOutside: vi.fn() }));

// Spy on the production QuizDriveService so we can simulate the 404 →
// regenerate → retry sequence without hitting Drive. The constructor mock
// returns the same shared instance every time so per-test wiring of
// exportResultsToSheet/createPlcSheetAndShare/regeneratePlcSheet is
// observable through the imported references.
const mockExportResultsToSheet = vi.fn();
const mockCreatePlcSheetAndShare = vi.fn();
const mockRegeneratePlcSheet = vi.fn();
vi.mock('@/utils/quizDriveService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/quizDriveService')>();
  class MockQuizDriveService {
    exportResultsToSheet = mockExportResultsToSheet;
    createPlcSheetAndShare = mockCreatePlcSheetAndShare;
    regeneratePlcSheet = mockRegeneratePlcSheet;
  }
  return {
    ...actual,
    QuizDriveService: MockQuizDriveService,
  };
});

// Lazy-import the component AFTER mocks are registered. PlcSheetMissingError
// is re-exported through the partial mock so `new PlcSheetMissingError(...)`
// uses the real class definition.
import { QuizResults } from '@/components/widgets/QuizWidget/components/QuizResults';
import { PlcSheetMissingError } from '@/utils/quizDriveService';

const STALE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/stale-sheet-id';
const REGEN_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/regenerated-sheet-id';

function makeQuiz(): QuizData {
  return {
    id: 'quiz-1',
    title: 'Sample Quiz',
    questions: [
      {
        id: 'q1',
        type: 'MC',
        text: 'Q1',
        correctAnswer: 'a',
        incorrectAnswers: ['b'],
        timeLimit: 30,
        points: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeResponse(pin: string): QuizResponse {
  return {
    studentUid: `uid-${pin}`,
    pin,
    classPeriod: 'Period 1',
    answers: [{ questionId: 'q1', answer: 'a', timestamp: 100 }],
    status: 'completed',
    submittedAt: 200,
    tabSwitchWarnings: 0,
  } as unknown as QuizResponse;
}

function makePlcConfig(): QuizConfig {
  return {
    view: 'results',
    plcMode: true,
    teacherName: 'Teacher A',
  } as unknown as QuizConfig;
}

describe('QuizResults — Re-export Sheet 404 regenerate-sheet recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlcSharedSheetUrl.mockResolvedValue(REGEN_SHEET_URL);
    clearPlcSharedSheetUrl.mockResolvedValue(undefined);
    // First call (initial Re-export Sheet append) throws 404 — sheet gone in
    // Drive. The catch path regenerates a fresh sheet and retries the
    // export against the new URL, which succeeds.
    mockExportResultsToSheet
      .mockReset()
      .mockRejectedValueOnce(
        new PlcSheetMissingError(
          'Shared PLC sheet is missing or inaccessible.',
          404
        )
      )
      .mockResolvedValueOnce(REGEN_SHEET_URL);
    mockCreatePlcSheetAndShare.mockReset().mockResolvedValue({
      url: REGEN_SHEET_URL,
      spreadsheetId: 'regenerated-sheet-id',
    });
  });

  it('persists the regenerated sheet URL via onExportUrlSaved so a reload does not rehydrate the stale URL', async () => {
    const onExportUrlSaved = vi.fn().mockResolvedValue(undefined);
    const onPlcSheetUrlReplaced = vi.fn().mockResolvedValue(undefined);
    const onExportedResponseIdsSaved = vi.fn().mockResolvedValue(undefined);

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={[makeResponse('1111'), makeResponse('2222')]}
        config={makePlcConfig()}
        onBack={vi.fn()}
        // exportUrl set + plcMode true + tracking initialized as empty
        // means trackingInitialized=true (initialExportedResponseIds is
        // an array, not null) AND there are 2 new responses to append,
        // so Re-export Sheet button is enabled.
        initialExportUrl={STALE_SHEET_URL}
        initialExportedResponseIds={[]}
        onExportUrlSaved={onExportUrlSaved}
        onPlcSheetUrlReplaced={onPlcSheetUrlReplaced}
        onExportedResponseIdsSaved={onExportedResponseIdsSaved}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /re-export sheet/i }));

    await waitFor(() => {
      expect(mockExportResultsToSheet).toHaveBeenCalledTimes(2);
    });

    // Recovery path: PLC's stale URL was cleared, a fresh sheet was created
    // and shared, and the canonical URL was persisted to BOTH the PLC's
    // /plcs/{id} doc (via onPlcSheetUrlReplaced) AND the assignment's
    // /quiz_assignments/{id} doc (via onExportUrlSaved). The latter is the
    // bug this test guards: without it, a reload rehydrates from the stale
    // URL and the 404→regenerate cycle repeats forever.
    await waitFor(() => {
      expect(onExportUrlSaved).toHaveBeenCalledWith(REGEN_SHEET_URL);
    });
    expect(clearPlcSharedSheetUrl).toHaveBeenCalledWith('plc-1');
    expect(mockCreatePlcSheetAndShare).toHaveBeenCalledTimes(1);
    expect(onPlcSheetUrlReplaced).toHaveBeenCalledWith(REGEN_SHEET_URL);
  });
});

describe('QuizResults — Re-export Sheet rebuild branch (no delta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExportResultsToSheet.mockReset();
    mockRegeneratePlcSheet.mockReset().mockResolvedValue(STALE_SHEET_URL);
    mockCreatePlcSheetAndShare.mockReset();
  });

  it('calls regeneratePlcSheet with all responses when no append-delta exists', async () => {
    const onExportUrlSaved = vi.fn().mockResolvedValue(undefined);
    const onExportedResponseIdsSaved = vi.fn().mockResolvedValue(undefined);

    // Two responses, both already in the exported snapshot →
    // newResponsesToAppend.length === 0 → smart re-export takes the
    // rebuild branch via regeneratePlcSheet rather than the append path.
    const responses = [makeResponse('1111'), makeResponse('2222')];
    // getResponseDocKey falls back to studentUid when _responseKey isn't
    // set on the response (no Firestore listener has attached it). The
    // makeResponse helper builds responses with studentUid: `uid-{pin}`.
    const allKeys = ['uid-1111', 'uid-2222'];

    render(
      <QuizResults
        quiz={makeQuiz()}
        responses={responses}
        config={makePlcConfig()}
        onBack={vi.fn()}
        initialExportUrl={STALE_SHEET_URL}
        initialExportedResponseIds={allKeys}
        onExportUrlSaved={onExportUrlSaved}
        onExportedResponseIdsSaved={onExportedResponseIdsSaved}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /re-export sheet/i }));

    // Rebuild branch fires regeneratePlcSheet, NOT exportResultsToSheet —
    // the latter would append duplicate rows. Verify both: regenerate
    // was invoked once with all responses, append was never called.
    await waitFor(() => {
      expect(mockRegeneratePlcSheet).toHaveBeenCalledTimes(1);
    });
    expect(mockExportResultsToSheet).not.toHaveBeenCalled();
    const [sheetUrl, passedResponses] = mockRegeneratePlcSheet.mock.calls[0];
    expect(sheetUrl).toBe(STALE_SHEET_URL);
    expect(passedResponses).toHaveLength(2);

    // After rebuild the exported-IDs snapshot is the full set of response
    // keys. Without this the next click would treat everything as "new"
    // and append duplicates against the just-regenerated sheet.
    await waitFor(() => {
      expect(onExportedResponseIdsSaved).toHaveBeenCalled();
    });
    const persistedIds = onExportedResponseIdsSaved.mock.calls[0][0];
    expect(persistedIds).toEqual(expect.arrayContaining(allKeys));

    // Confirmation toast distinguishes rebuild from append so the
    // teacher can tell what just happened.
    expect(addToast).toHaveBeenCalledWith(
      expect.stringMatching(/rebuilt from scratch/i),
      'success'
    );
  });
});
