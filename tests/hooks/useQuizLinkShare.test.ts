import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQuizLinkShare } from '@/hooks/useQuizLinkShare';
import {
  quizHasBankSlots,
  resolveQuizAssignment,
  type BankContent,
} from '@/utils/questionBanks';
import type { QuizAssignment, QuizData, QuizMetadata } from '@/types';

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __db: true },
  functions: { __functions: true },
  auth: {},
  storage: {},
  isAuthBypass: false,
  isConfigured: true,
}));

vi.mock('@/utils/questionBanks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/questionBanks')>();
  return {
    ...actual,
    quizHasBankSlots: vi.fn(actual.quizHasBankSlots),
    resolveQuizAssignment: vi.fn(actual.resolveQuizAssignment),
  };
});

const mockHasBankSlots = quizHasBankSlots as Mock;
const mockResolve = resolveQuizAssignment as Mock;

type Args = Parameters<typeof useQuizLinkShare>[0];

const meta = (id: string, over: Partial<QuizMetadata> = {}): QuizMetadata =>
  ({
    id,
    driveFileId: `drive-${id}`,
    title: `Title ${id}`,
    ...over,
  }) as QuizMetadata;

const quizData = (id: string, over: Partial<QuizData> = {}): QuizData =>
  ({
    id,
    title: `Data ${id}`,
    questions: [{ id: `${id}-q1` }],
    ...over,
  }) as unknown as QuizData;

const assignment = (over: Partial<QuizAssignment> = {}): QuizAssignment =>
  ({ id: 'asg-1', quizId: 'q1', ...over }) as QuizAssignment;

const VIEW_ONLY_OPTIONS = {
  tabWarningsEnabled: false,
  tabWarningThreshold: 'off',
  tabAwayLimitSeconds: 30,
  tabAwayAutoSubmit: false,
  readAloudAll: false,
  blockCopyPaste: false,
  blockPrint: false,
  allowStimulusQuotes: false,
  showResultToStudent: false,
  showCorrectAnswerToStudent: false,
  showCorrectOnBoard: false,
  showLearningTargets: false,
  showExplanations: false,
  speedBonusEnabled: false,
  streakBonusEnabled: false,
  showPodiumBetweenQuestions: false,
  soundEffectsEnabled: false,
  handRaiseEnabled: false,
  showScoreOnSubmit: false,
  timeLimitMinutes: null,
  shuffleQuestions: false,
  shuffleAnswerOptions: false,
};

describe('useQuizLinkShare', () => {
  const addToast = vi.fn<Args['addToast']>();
  const shareQuiz = vi.fn<Args['shareQuiz']>();
  const loadBankContentsForQuiz = vi.fn<Args['loadBankContentsForQuiz']>();
  const loadQuiz = vi.fn<Args['loadQuiz']>();
  const createAssignment = vi.fn<Args['createAssignment']>();
  const shareAssignment = vi.fn<Args['shareAssignment']>();
  const writeText = vi.fn<(text: string) => Promise<void>>();

  const render = (over: Partial<Args> = {}) =>
    renderHook(() =>
      useQuizLinkShare({
        quizzes: [meta('q1', { districtOrigin: ['district-1'] })],
        addToast,
        shareQuiz,
        loadBankContentsForQuiz,
        loadQuiz,
        createAssignment,
        shareAssignment,
        kindTag: { widgetKind: 'quiz' },
        ...over,
      })
    ).result.current;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasBankSlots.mockReturnValue(false);
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  describe('onShare', () => {
    it('copies the share link and confirms', async () => {
      shareQuiz.mockResolvedValue('https://x/share/1');
      const m = meta('q1');
      await render().onShare(m);
      expect(shareQuiz).toHaveBeenCalledWith(m, loadBankContentsForQuiz);
      expect(writeText).toHaveBeenCalledWith('https://x/share/1');
      expect(addToast).toHaveBeenCalledTimes(1);
      expect(addToast).toHaveBeenCalledWith(
        'Share link copied to clipboard!',
        'success'
      );
    });

    it('shows the link in a toast when the clipboard refuses', async () => {
      shareQuiz.mockResolvedValue('https://x/share/1');
      writeText.mockRejectedValue(new Error('denied'));
      await render().onShare(meta('q1'));
      expect(addToast).toHaveBeenCalledTimes(1);
      expect(addToast).toHaveBeenCalledWith(
        'Share link: https://x/share/1',
        'info'
      );
    });

    it('toasts the error message and skips the clipboard when sharing fails', async () => {
      shareQuiz.mockRejectedValue(new Error('Drive is down'));
      await render().onShare(meta('q1'));
      expect(writeText).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledTimes(1);
      expect(addToast).toHaveBeenCalledWith('Drive is down', 'error');
    });

    it('falls back to "Share failed" for a non-Error rejection', async () => {
      shareQuiz.mockRejectedValue('nope');
      await render().onShare(meta('q1'));
      expect(addToast).toHaveBeenCalledWith('Share failed', 'error');
    });
  });

  describe('onCreateViewOnlyShare', () => {
    it('creates a paused view-only assignment and returns its student URL', async () => {
      const data = quizData('q1', { language: 'es' });
      loadQuiz.mockResolvedValue(data);
      createAssignment.mockResolvedValue({ id: 'asg-9', code: 'AB C/1' });
      const m = meta('q1');
      const url = await render({
        kindTag: { widgetKind: 'review' },
      }).onCreateViewOnlyShare(m);
      expect(loadQuiz).toHaveBeenCalledWith(m);
      expect(loadBankContentsForQuiz).not.toHaveBeenCalled();
      expect(createAssignment).toHaveBeenCalledWith(
        {
          id: 'q1',
          title: 'Title q1',
          driveFileId: 'drive-q1',
          questions: data.questions,
          language: 'es',
        },
        {
          sessionMode: 'teacher',
          sessionOptions: VIEW_ONLY_OPTIONS,
          attemptLimit: null,
        },
        { widgetKind: 'review', initialStatus: 'paused', mode: 'view-only' }
      );
      expect(url).toBe(
        `${window.location.origin}/quiz?code=${encodeURIComponent('AB C/1')}`
      );
      expect(addToast).not.toHaveBeenCalled();
    });

    it('resolves bank slots into the full pool before creating the share', async () => {
      const data = quizData('q1');
      const contents = new Map<string, BankContent>();
      const resolvedQuestions = [{ id: 'drawn-1' }, { id: 'drawn-2' }];
      const resolvedStimuli = [{ id: 'stim-1' }];
      loadQuiz.mockResolvedValue(data);
      mockHasBankSlots.mockReturnValue(true);
      loadBankContentsForQuiz.mockResolvedValue(contents);
      mockResolve.mockReturnValue({
        questions: resolvedQuestions,
        stimuli: resolvedStimuli,
      });
      createAssignment.mockResolvedValue({ id: 'asg-9', code: 'XYZ' });
      await render().onCreateViewOnlyShare(meta('q1'));
      expect(loadBankContentsForQuiz).toHaveBeenCalledWith(data);
      expect(mockResolve).toHaveBeenCalledWith(data, contents);
      expect(createAssignment).toHaveBeenCalledWith(
        {
          id: 'q1',
          title: 'Title q1',
          driveFileId: 'drive-q1',
          questions: resolvedQuestions,
          stimuli: resolvedStimuli,
        },
        expect.anything(),
        { widgetKind: 'quiz', initialStatus: 'paused', mode: 'view-only' }
      );
    });

    it('throws when the quiz cannot be loaded', async () => {
      loadQuiz.mockResolvedValue(null);
      await expect(render().onCreateViewOnlyShare(meta('q1'))).rejects.toThrow(
        'Failed to load quiz data'
      );
      expect(createAssignment).not.toHaveBeenCalled();
      expect(addToast).not.toHaveBeenCalled();
    });

    it('lets a createAssignment failure reach the caller', async () => {
      loadQuiz.mockResolvedValue(quizData('q1'));
      createAssignment.mockRejectedValue(new Error('rules said no'));
      await expect(render().onCreateViewOnlyShare(meta('q1'))).rejects.toThrow(
        'rules said no'
      );
      expect(addToast).not.toHaveBeenCalled();
    });
  });

  describe('onArchiveShare', () => {
    it('copies the assignment share link and confirms', async () => {
      const data = quizData('q1');
      loadQuiz.mockResolvedValue(data);
      shareAssignment.mockResolvedValue('https://x/share/assignment/1');
      await render().onArchiveShare(assignment());
      expect(loadQuiz).toHaveBeenCalledWith(
        meta('q1', { districtOrigin: ['district-1'] })
      );
      expect(shareAssignment).toHaveBeenCalledWith(
        'asg-1',
        data,
        loadBankContentsForQuiz,
        ['district-1']
      );
      expect(writeText).toHaveBeenCalledWith('https://x/share/assignment/1');
      expect(addToast).toHaveBeenCalledTimes(1);
      expect(addToast).toHaveBeenCalledWith(
        'Assignment share link copied!',
        'success'
      );
    });

    it('shows the link in a toast when the clipboard refuses', async () => {
      loadQuiz.mockResolvedValue(quizData('q1'));
      shareAssignment.mockResolvedValue('https://x/share/assignment/1');
      writeText.mockRejectedValue(new Error('denied'));
      await render().onArchiveShare(assignment());
      expect(addToast).toHaveBeenCalledTimes(1);
      expect(addToast).toHaveBeenCalledWith(
        'Assignment share link: https://x/share/assignment/1',
        'info'
      );
    });

    it('refuses when the quiz has left the library', async () => {
      await render().onArchiveShare(assignment({ quizId: 'gone' }));
      expect(loadQuiz).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith(
        'Quiz no longer in library — cannot share assignment.',
        'error'
      );
    });

    it('stops quietly when the quiz does not load', async () => {
      loadQuiz.mockResolvedValue(null);
      await render().onArchiveShare(assignment());
      expect(shareAssignment).not.toHaveBeenCalled();
      expect(addToast).not.toHaveBeenCalled();
    });

    it('toasts the error message when sharing fails', async () => {
      loadQuiz.mockResolvedValue(quizData('q1'));
      shareAssignment.mockRejectedValue(new Error('library content'));
      await render().onArchiveShare(assignment());
      expect(writeText).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledTimes(1);
      expect(addToast).toHaveBeenCalledWith('library content', 'error');
    });

    it('toasts the error message when loading throws', async () => {
      loadQuiz.mockRejectedValue(new Error('load broke'));
      await render().onArchiveShare(assignment());
      expect(shareAssignment).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith('load broke', 'error');
    });

    it('falls back to "Share failed" for a non-Error rejection', async () => {
      loadQuiz.mockResolvedValue(quizData('q1'));
      shareAssignment.mockRejectedValue('nope');
      await render().onArchiveShare(assignment());
      expect(addToast).toHaveBeenCalledWith('Share failed', 'error');
    });
  });
});
