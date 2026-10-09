import React, { useCallback, useState } from 'react';
import type {
  ClassRoster,
  QuizConfig,
  QuizData,
  QuizMetadata,
  ReviewConfig,
  ReviewLaunchSettings,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useQuizHandRaiseMode } from '@/hooks/useQuizHandRaiseMode';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import type { BankContent } from '@/utils/questionBanks';
import {
  BankSlotResolutionError,
  quizHasBankSlots,
} from '@/utils/questionBanks';
import { quizAssignBlocker } from '@/utils/activityCompleteness';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import {
  clampGameMinutes,
  countUnscoredQuestions,
  DEFAULT_REVIEW_LAUNCH_SETTINGS,
  prepareReviewGame,
  prepareReviewQuiz,
} from '@/utils/reviewLaunch';
import { logError } from '@/utils/logError';
import { StartReviewModal } from './components/StartReviewModal';

interface UseReviewLaunchArgs {
  config: QuizConfig;
  rosters: ClassRoster[];
  loadQuiz: (meta: QuizMetadata) => Promise<QuizData | null>;
  loadBankContentsForQuiz: (
    quiz: QuizData
  ) => Promise<Map<string, BankContent>>;
  saveDriveSnapshot: (quiz: QuizData) => Promise<string>;
  createAssignment: UseQuizAssignmentsResult['createAssignment'];
  addToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  /** The session is created; the widget moves to the live monitor. */
  onLaunched: (launched: {
    assignmentId: string;
    code: string;
    meta: QuizMetadata;
    rosterIds: string[];
    resolvedDriveFileId?: string;
  }) => void;
}

/** Review's Start dialog and teacher-paced launch (plan D13-D21). */
export function useReviewLaunch({
  config,
  rosters,
  loadQuiz,
  loadBankContentsForQuiz,
  saveDriveSnapshot,
  createAssignment,
  addToast,
  onLaunched,
}: UseReviewLaunchArgs) {
  const { savedWidgetPresets, saveWidgetPreset, canAccessFeature } = useAuth();
  const handRaiseMode = useQuizHandRaiseMode();
  const [target, setTarget] = useState<{
    meta: QuizMetadata;
    data: QuizData;
  } | null>(null);

  const open = useCallback(
    async (meta: QuizMetadata) => {
      const data = await loadQuiz(meta);
      if (!data) return;
      const blocker = quizAssignBlocker(data);
      if (blocker) {
        addToast(`This quiz can't be started yet: ${blocker}.`, 'error');
        return;
      }
      setTarget({ meta, data });
    },
    [loadQuiz, addToast]
  );

  const startGame = useCallback(
    async (settings: ReviewLaunchSettings, rosterIds: string[]) => {
      if (!target) return;
      const { meta, data } = target;
      let prepared: ReturnType<typeof prepareReviewGame>;
      try {
        const banks = quizHasBankSlots(data)
          ? await loadBankContentsForQuiz(data)
          : null;
        prepared = prepareReviewGame(data, banks);
      } catch (err) {
        if (err instanceof BankSlotResolutionError) {
          for (const problem of err.problems)
            addToast(problem.message, 'error');
        } else {
          logError('ReviewLaunch.resolveBanks', err, { quizId: meta.id });
          addToast('Could not load the question banks for this quiz.', 'error');
        }
        return;
      }
      if (prepared.questions.length === 0) {
        addToast('Every question needs a teacher grade.', 'error');
        return;
      }
      // Results grade from Drive, so a pooled or trimmed set needs its own copy.
      let resolvedDriveFileId: string | undefined;
      if (prepared.skippedCount > 0 || prepared.bankSlots) {
        try {
          resolvedDriveFileId = await saveDriveSnapshot({
            ...data,
            questions: prepared.questions,
            stimuli: prepared.stimuli,
            bankSlots: undefined,
            order: undefined,
          });
        } catch (err) {
          logError('ReviewLaunch.saveDriveSnapshot', err, { quizId: meta.id });
          addToast(
            'Could not save the review copy to Google Drive. Check your Drive connection and try again.',
            'error'
          );
          return;
        }
      }
      const selected = rosters.filter((r) => rosterIds.includes(r.id));
      const derived = deriveSessionTargetsFromRosters(selected);
      const gameMinutes = clampGameMinutes(settings.gameMinutes);
      try {
        const { id, code } = await createAssignment(
          {
            id: meta.id,
            title: meta.title,
            driveFileId: resolvedDriveFileId ?? meta.driveFileId,
            questions: prepared.questions,
            ...(prepared.stimuli ? { stimuli: prepared.stimuli } : {}),
            ...(data.language ? { language: data.language } : {}),
            ...(data.sections?.length
              ? { order: data.order, sections: data.sections }
              : {}),
          },
          {
            sessionMode: 'game',
            // D13: no score on submit; the game has no podium between questions.
            sessionOptions: {
              ...settings.sessionOptions,
              showScoreOnSubmit: false,
              showPodiumBetweenQuestions: false,
            },
            attemptLimit: null,
            teacherName: config.teacherName,
            periodNames: derived.periodNames,
            ...(derived.periodNames[0]
              ? { periodName: derived.periodNames[0] }
              : {}),
            ...(resolvedDriveFileId ? { resolvedDriveFileId } : {}),
          },
          {
            widgetKind: 'review',
            gameDurationMs: gameMinutes * 60_000,
            ...(prepared.bankSlots ? { bankSlots: prepared.bankSlots } : {}),
            classIds: derived.classIds,
            rosterIds: derived.rosterIds,
            classPeriodByClassId: derived.classPeriodByClassId,
            ...(meta.translations && !prepared.bankSlots
              ? { translationIndex: meta.translations }
              : {}),
          }
        );
        const preset: Partial<ReviewConfig> = {
          lastLaunch: { ...settings, gameMinutes },
        };
        saveWidgetPreset('review', preset);
        setTarget(null);
        onLaunched({
          assignmentId: id,
          code,
          meta,
          rosterIds,
          ...(resolvedDriveFileId ? { resolvedDriveFileId } : {}),
        });
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : 'Failed to start the review',
          'error'
        );
      }
    },
    [
      target,
      rosters,
      config.teacherName,
      loadBankContentsForQuiz,
      saveDriveSnapshot,
      createAssignment,
      saveWidgetPreset,
      addToast,
      onLaunched,
    ]
  );

  const start = useCallback(
    async (settings: ReviewLaunchSettings, rosterIds: string[]) => {
      if (!target) return;
      if (settings.sessionMode === 'game') {
        await startGame(settings, rosterIds);
        return;
      }
      const { meta, data } = target;
      let prepared: ReturnType<typeof prepareReviewQuiz>;
      try {
        const banks = quizHasBankSlots(data)
          ? await loadBankContentsForQuiz(data)
          : null;
        prepared = prepareReviewQuiz(data, banks);
      } catch (err) {
        if (err instanceof BankSlotResolutionError) {
          for (const problem of err.problems)
            addToast(problem.message, 'error');
        } else {
          logError('ReviewLaunch.resolveBanks', err, { quizId: meta.id });
          addToast('Could not load the question banks for this quiz.', 'error');
        }
        return;
      }
      if (prepared.questions.length === 0) {
        addToast('Every question needs a teacher grade.', 'error');
        return;
      }
      // The monitor grades from Drive, so a drawn or trimmed set needs its own copy.
      const needsSnapshot =
        prepared.skippedCount > 0 ||
        quizHasBankSlots(data) ||
        (data.sections ?? []).some((s) => s.chooseCount !== undefined);
      let resolvedDriveFileId: string | undefined;
      if (needsSnapshot) {
        try {
          resolvedDriveFileId = await saveDriveSnapshot({
            ...data,
            questions: prepared.questions,
            stimuli: prepared.stimuli,
            order: prepared.order,
            sections: prepared.sections,
            bankSlots: undefined,
          });
        } catch (err) {
          logError('ReviewLaunch.saveDriveSnapshot', err, { quizId: meta.id });
          addToast(
            'Could not save the review copy to Google Drive. Check your Drive connection and try again.',
            'error'
          );
          return;
        }
      }
      const selected = rosters.filter((r) => rosterIds.includes(r.id));
      const derived = deriveSessionTargetsFromRosters(selected);
      try {
        const { id, code } = await createAssignment(
          {
            id: meta.id,
            title: meta.title,
            driveFileId: resolvedDriveFileId ?? meta.driveFileId,
            questions: prepared.questions,
            ...(prepared.stimuli ? { stimuli: prepared.stimuli } : {}),
            ...(data.language ? { language: data.language } : {}),
            ...(prepared.sections?.length
              ? { order: prepared.order, sections: prepared.sections }
              : {}),
          },
          {
            sessionMode: settings.sessionMode,
            // D13: no score on submit and no question shuffle in paced play.
            sessionOptions: {
              ...settings.sessionOptions,
              showScoreOnSubmit: false,
              shuffleQuestions: false,
            },
            attemptLimit: null,
            teacherName: config.teacherName,
            periodNames: derived.periodNames,
            ...(derived.periodNames[0]
              ? { periodName: derived.periodNames[0] }
              : {}),
            ...(resolvedDriveFileId ? { resolvedDriveFileId } : {}),
          },
          {
            widgetKind: 'review',
            initialStatus: 'paused',
            classIds: derived.classIds,
            rosterIds: derived.rosterIds,
            classPeriodByClassId: derived.classPeriodByClassId,
            ...(meta.translations
              ? { translationIndex: meta.translations }
              : {}),
          }
        );
        const preset: Partial<ReviewConfig> = { lastLaunch: settings };
        saveWidgetPreset('review', preset);
        setTarget(null);
        onLaunched({
          assignmentId: id,
          code,
          meta,
          rosterIds,
          ...(resolvedDriveFileId ? { resolvedDriveFileId } : {}),
        });
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : 'Failed to start the review',
          'error'
        );
      }
    },
    [
      target,
      rosters,
      config.teacherName,
      loadBankContentsForQuiz,
      saveDriveSnapshot,
      createAssignment,
      saveWidgetPreset,
      addToast,
      onLaunched,
      startGame,
    ]
  );

  const lastLaunch = (savedWidgetPresets.review as ReviewConfig | undefined)
    ?.lastLaunch;
  const modal = target ? (
    <StartReviewModal
      key={target.meta.id}
      quizTitle={target.meta.title}
      rosters={rosters}
      initialRosterIds={config.lastRosterIdsByQuizId?.[target.meta.id] ?? []}
      initialSettings={
        lastLaunch
          ? {
              ...DEFAULT_REVIEW_LAUNCH_SETTINGS,
              ...lastLaunch,
              sessionOptions: {
                ...DEFAULT_REVIEW_LAUNCH_SETTINGS.sessionOptions,
                ...lastLaunch.sessionOptions,
              },
            }
          : DEFAULT_REVIEW_LAUNCH_SETTINGS
      }
      skippedCount={countUnscoredQuestions(target.data.questions)}
      nothingToPlay={
        !quizHasBankSlots(target.data) &&
        countUnscoredQuestions(target.data.questions) ===
          target.data.questions.length
      }
      handRaiseMode={handRaiseMode}
      readAloudAvailable={canAccessFeature('quiz-read-aloud')}
      classMenu={canAccessFeature('assign-stepper')}
      onClose={() => setTarget(null)}
      onStart={start}
    />
  ) : null;

  return { open, modal };
}
