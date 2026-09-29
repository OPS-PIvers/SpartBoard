import type {
  QuizBehaviorSettings,
  QuizData,
  QuizSession,
  QuizSessionOptions,
} from '@/types';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import { dedupeQuestionsById } from '@/utils/quizMaxPoints';
import { sessionSectionsFor } from '@/utils/quizSections';
import {
  projectSessionStimuli,
  readAloudTextByStimulusId,
} from '@/utils/quizStimuli';
import { tabAwaySessionFields } from '@/utils/tabAwayLimit';

/** Focus-mode settings a teacher can flip from the Student view toolbar. */
export type StudentViewFocusSettings = Pick<
  QuizSessionOptions,
  | 'tabWarningsEnabled'
  | 'tabWarningThreshold'
  | 'tabAwayLimitSeconds'
  | 'tabAwayAutoSubmit'
  | 'blockCopyPaste'
>;

export const STUDENT_VIEW_SESSION_ID = 'student-view-preview';

export function focusSettingsFrom(
  behavior: QuizBehaviorSettings
): StudentViewFocusSettings {
  const o = behavior.sessionOptions;
  return {
    tabWarningsEnabled: o.tabWarningsEnabled ?? true,
    tabWarningThreshold: o.tabWarningThreshold,
    tabAwayLimitSeconds: o.tabAwayLimitSeconds,
    tabAwayAutoSubmit: o.tabAwayAutoSubmit === true,
    blockCopyPaste: o.blockCopyPaste ?? false,
  };
}

/** Local-only session mirroring what Assign would stamp for a self-paced attempt. */
export function buildStudentViewSession(
  quiz: QuizData,
  behavior: QuizBehaviorSettings,
  tabAwayTimerOn: boolean
): QuizSession {
  const opts = behavior.sessionOptions;
  const questions = dedupeQuestionsById(quiz.questions);
  const publicQuestions = questions.map((q) => {
    const { targets, recording: _recording, ...rest } = toPublicQuestion(q);
    return opts.showLearningTargets && targets ? { ...rest, targets } : rest;
  });
  const stimuli = projectSessionStimuli({ questions, stimuli: quiz.stimuli });
  const readAloudText = readAloudTextByStimulusId({
    questions,
    stimuli: quiz.stimuli,
  });
  const sections = sessionSectionsFor({
    questions,
    order: quiz.order,
    sections: quiz.sections,
  });
  const now = Date.now();
  return {
    id: STUDENT_VIEW_SESSION_ID,
    assignmentId: STUDENT_VIEW_SESSION_ID,
    quizId: quiz.id,
    quizTitle: quiz.title,
    teacherUid: '',
    status: 'active',
    sessionMode: 'student',
    currentQuestionIndex: 0,
    startedAt: now,
    endedAt: null,
    code: '',
    totalQuestions: questions.length,
    publicQuestions,
    ...(sections.length > 0 ? { sections } : {}),
    ...(stimuli.length > 0 ? { stimuli } : {}),
    ...(Object.keys(readAloudText).length > 0
      ? { readAloudTextByStimulusId: readAloudText }
      : {}),
    ...(quiz.language ? { language: quiz.language } : {}),
    ...(opts.handRaiseEnabled ? { handRaiseEnabled: true } : {}),
    ...focusSessionFields(focusSettingsFrom(behavior), tabAwayTimerOn),
    showResultToStudent: opts.showResultToStudent ?? false,
    showCorrectAnswerToStudent: opts.showCorrectAnswerToStudent ?? false,
    showCorrectOnBoard: false,
    showLearningTargets: opts.showLearningTargets ?? false,
    revealedAnswers: {},
    speedBonusEnabled: opts.speedBonusEnabled ?? false,
    streakBonusEnabled: opts.streakBonusEnabled ?? false,
    showPodiumBetweenQuestions: false,
    soundEffectsEnabled: opts.soundEffectsEnabled ?? false,
    shuffleQuestions: opts.shuffleQuestions ?? false,
    shuffleAnswerOptions: opts.shuffleAnswerOptions ?? true,
    questionPhase: 'answering',
    attemptLimit: null,
  };
}

/** Swaps only the focus-mode fields, so answer order stays put while the teacher toggles. */
export function withFocusSettings(
  session: QuizSession,
  focus: StudentViewFocusSettings,
  tabAwayTimerOn: boolean
): QuizSession {
  const {
    tabWarningThreshold: _threshold,
    tabAwayLimitSeconds: _limit,
    tabAwayAutoSubmit: _autoSubmit,
    ...rest
  } = session;
  return { ...rest, ...focusSessionFields(focus, tabAwayTimerOn) };
}

function focusSessionFields(
  focus: StudentViewFocusSettings,
  tabAwayTimerOn: boolean
): Partial<QuizSession> {
  return {
    tabWarningsEnabled: focus.tabWarningsEnabled ?? true,
    ...(focus.tabWarningThreshold !== undefined
      ? { tabWarningThreshold: focus.tabWarningThreshold }
      : {}),
    ...tabAwaySessionFields(tabAwayTimerOn, focus),
    blockCopyPaste: focus.blockCopyPaste ?? false,
  };
}
