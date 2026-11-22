import type {
  QuizAssignment,
  QuizData,
  QuizMetadata,
  QuizWidgetKind,
} from '@/types';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type { UseQuizResult } from '@/hooks/useQuiz';
import type { UseBankSourcesResult } from '@/hooks/useBankSources';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import type { QuizSessionOptions } from '@/hooks/useQuizSession';
import { quizHasBankSlots, resolveQuizAssignment } from '@/utils/questionBanks';
import { DEFAULT_TAB_AWAY_LIMIT_SECONDS } from '@/utils/tabAwayLimit';

// Every per-attempt option is off: a view-only share has no submissions.
// Review's board size and the focus level never apply to a view-only share.
const VIEW_ONLY_SESSION_OPTIONS: Required<
  Omit<QuizSessionOptions, 'boardRankLimit' | 'focusLevel'>
> = {
  tabWarningsEnabled: false,
  tabWarningThreshold: 'off',
  // Tab warnings are off, so the away clock never runs.
  tabAwayLimitSeconds: DEFAULT_TAB_AWAY_LIMIT_SECONDS,
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
  // No live teacher present on a view-only share, so raising a hand goes nowhere.
  handRaiseEnabled: false,
  showScoreOnSubmit: false,
  timeLimitMinutes: null,
  // No submissions, so nothing is rendered per student.
  shuffleQuestions: false,
  shuffleAnswerOptions: false,
};

interface UseQuizLinkShareArgs {
  quizzes: QuizMetadata[];
  addToast: DashboardContextValue['addToast'];
  shareQuiz: UseQuizResult['shareQuiz'];
  loadBankContentsForQuiz: UseBankSourcesResult['loadBankContentsForQuiz'];
  loadQuiz: (meta: QuizMetadata) => Promise<QuizData | null>;
  createAssignment: UseQuizAssignmentsResult['createAssignment'];
  shareAssignment: UseQuizAssignmentsResult['shareAssignment'];
  kindTag: { widgetKind: QuizWidgetKind };
}

// Fresh handlers every render, as the inline JSX props they replace were.
export const useQuizLinkShare = ({
  quizzes,
  addToast,
  shareQuiz,
  loadBankContentsForQuiz,
  loadQuiz,
  createAssignment,
  shareAssignment,
  kindTag,
}: UseQuizLinkShareArgs) => {
  const onShare = async (meta: QuizMetadata) => {
    let url: string;
    try {
      url = await shareQuiz(meta, loadBankContentsForQuiz);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Share failed', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      addToast('Share link copied to clipboard!', 'success');
    } catch {
      addToast(`Share link: ${url}`, 'info');
    }
  };

  const onCreateViewOnlyShare = async (meta: QuizMetadata) => {
    // Skips the assign flow: a minimal view-only assignment, returning its student URL.
    const data = await loadQuiz(meta);
    if (!data) {
      throw new Error('Failed to load quiz data');
    }
    // View-only browsing shows the whole frozen pool; nothing is drawn.
    let viewQuestions = data.questions;
    let viewStimuli = data.stimuli;
    if (quizHasBankSlots(data)) {
      const contents = await loadBankContentsForQuiz(data);
      const resolved = resolveQuizAssignment(data, contents);
      viewQuestions = resolved.questions;
      viewStimuli = resolved.stimuli;
    }
    const { code } = await createAssignment(
      {
        id: meta.id,
        title: meta.title,
        driveFileId: meta.driveFileId,
        questions: viewQuestions,
        ...(viewStimuli ? { stimuli: viewStimuli } : {}),
        ...(data.language ? { language: data.language } : {}),
      },
      {
        sessionMode: 'teacher',
        sessionOptions: VIEW_ONLY_SESSION_OPTIONS,
        attemptLimit: null,
      },
      { ...kindTag, initialStatus: 'paused', mode: 'view-only' }
    );
    return `${window.location.origin}/quiz?code=${encodeURIComponent(code)}`;
  };

  const onArchiveShare = async (a: QuizAssignment) => {
    const meta = quizzes.find((q) => q.id === a.quizId);
    if (!meta) {
      addToast('Quiz no longer in library — cannot share assignment.', 'error');
      return;
    }
    try {
      const data = await loadQuiz(meta);
      if (!data) return;
      const url = await shareAssignment(
        a.id,
        data,
        loadBankContentsForQuiz,
        meta.districtOrigin
      );
      try {
        await navigator.clipboard.writeText(url);
        addToast('Assignment share link copied!', 'success');
      } catch {
        addToast(`Assignment share link: ${url}`, 'info');
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Share failed', 'error');
    }
  };

  return { onShare, onCreateViewOnlyShare, onArchiveShare };
};
