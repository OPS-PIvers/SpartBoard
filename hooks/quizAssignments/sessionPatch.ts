import { deleteField } from 'firebase/firestore';
import { clampQuizTimeLimitMinutes } from '@/utils/quizTimeLimit';
import { isFocusLevel } from '@/utils/pageProtections';
import type { QuizResponse, QuizSessionOptions } from '@/types';

export const HAND_RAISE_GATE_TIMEOUT_MS = 5000;

/** True while a signed-in teacher's profile, org membership or permissions are still loading. */
export function isHandRaiseGatePending(
  ctx:
    | {
        user?: unknown;
        profileLoaded?: boolean;
        roleResolved?: boolean;
        featurePermissionsLoaded?: boolean;
      }
    | null
    | undefined
): boolean {
  if (!ctx?.user) return false;
  return (
    ctx.profileLoaded === false ||
    ctx.roleResolved === false ||
    ctx.featurePermissionsLoaded === false
  );
}

/** Flatten session-option toggles onto the session doc's mirror fields. */
export function sessionOptionsToSessionPatch(
  o: QuizSessionOptions,
  gates: {
    timeLimitOn: boolean;
    scoreOnSubmitOn: boolean;
    stimulusQuotesOn: boolean;
    pageProtectionsOn: boolean;
    /** False for a Quiz assessment: game extras are written off. */
    reviewGame: boolean;
  }
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (o.tabWarningsEnabled !== undefined)
    patch.tabWarningsEnabled = o.tabWarningsEnabled;
  if (o.tabWarningThreshold !== undefined)
    patch.tabWarningThreshold = o.tabWarningThreshold;
  if (o.tabAwayLimitSeconds !== undefined)
    patch.tabAwayLimitSeconds = o.tabAwayLimitSeconds;
  if (o.tabAwayAutoSubmit !== undefined)
    patch.tabAwayAutoSubmit = o.tabAwayAutoSubmit;
  if (o.blockCopyPaste !== undefined) patch.blockCopyPaste = o.blockCopyPaste;
  if (gates.pageProtectionsOn) {
    if (o.blockCopyPaste !== undefined) patch.blockPrint = o.blockCopyPaste;
    // Turning "Require fullscreen" off sends the key as undefined.
    if ('focusLevel' in o)
      patch.focusLevel = isFocusLevel(o.focusLevel)
        ? o.focusLevel
        : deleteField();
  }
  if (o.allowStimulusQuotes !== undefined && gates.stimulusQuotesOn)
    patch.allowStimulusQuotes = o.allowStimulusQuotes;
  if (o.showResultToStudent !== undefined)
    patch.showResultToStudent = o.showResultToStudent;
  if (o.showCorrectAnswerToStudent !== undefined)
    patch.showCorrectAnswerToStudent = o.showCorrectAnswerToStudent;
  if (o.showCorrectOnBoard !== undefined)
    patch.showCorrectOnBoard = o.showCorrectOnBoard;
  if (o.showLearningTargets !== undefined)
    patch.showLearningTargets = o.showLearningTargets;
  if (o.showExplanations !== undefined)
    patch.showExplanations = o.showExplanations;
  if (o.speedBonusEnabled !== undefined)
    patch.speedBonusEnabled = gates.reviewGame && o.speedBonusEnabled;
  if (o.streakBonusEnabled !== undefined)
    patch.streakBonusEnabled = gates.reviewGame && o.streakBonusEnabled;
  if (o.showPodiumBetweenQuestions !== undefined)
    patch.showPodiumBetweenQuestions =
      gates.reviewGame && o.showPodiumBetweenQuestions;
  if (o.soundEffectsEnabled !== undefined)
    patch.soundEffectsEnabled = gates.reviewGame && o.soundEffectsEnabled;
  if (o.shuffleQuestions !== undefined)
    patch.shuffleQuestions = o.shuffleQuestions;
  if (o.shuffleAnswerOptions !== undefined)
    patch.shuffleAnswerOptions = o.shuffleAnswerOptions;
  if (o.readAloudAll !== undefined) patch.readAloudAll = o.readAloudAll;
  if (o.showScoreOnSubmit !== undefined && gates.scoreOnSubmitOn)
    patch.showScoreOnSubmit = o.showScoreOnSubmit;
  if (o.timeLimitMinutes !== undefined && gates.timeLimitOn)
    patch.timeLimitMinutes = clampQuizTimeLimitMinutes(o.timeLimitMinutes);
  // `handRaiseEnabled` is deliberately NOT mirrored: it is resolved against the
  // admin gate at create time only, so a later patch (e.g. a PLC sync) can't
  // switch raise hand on inside a force-off building. Running sessions keep
  // the value they were created with.
  return patch;
}

/** True when a response holds a handwritten paper answer the worker or an edit can rewrite. */
export function hasPaperWrittenAnswer(data: QuizResponse): boolean {
  return (
    Array.isArray(data.answers) &&
    data.answers.some((a) => a?.paperTranscript !== undefined)
  );
}

/** Handwritten paper answers still waiting on a transcript across a set of responses. */
export function countPendingPaperTranscripts(
  responses: QuizResponse[]
): number {
  let pending = 0;
  for (const r of responses) {
    if (!Array.isArray(r.answers)) continue;
    for (const a of r.answers)
      if (a?.paperTranscript === 'pending') pending += 1;
  }
  return pending;
}
