// Resolves the admin raise-hand gate + the per-quiz teacher checkbox into one boolean.
import type { FeaturePermission, QuizGlobalConfig } from '@/types';

export type QuizHandRaiseMode = 'teacher-choice' | 'force-on' | 'force-off';

export const DEFAULT_QUIZ_HAND_RAISE_MODE: QuizHandRaiseMode = 'teacher-choice';

export const QUIZ_HAND_RAISE_MODES: readonly QuizHandRaiseMode[] = [
  'teacher-choice',
  'force-on',
  'force-off',
];

const isMode = (value: unknown): value is QuizHandRaiseMode =>
  typeof value === 'string' &&
  (QUIZ_HAND_RAISE_MODES as readonly string[]).includes(value);

/** Reads the building's raise-hand mode off `feature_permissions/quiz.config`. */
export const readQuizHandRaiseMode = (
  permissions: readonly FeaturePermission[] | null | undefined,
  buildingId: string | null | undefined
): QuizHandRaiseMode => {
  if (!permissions || !buildingId) return DEFAULT_QUIZ_HAND_RAISE_MODE;
  const config = permissions.find((p) => p.widgetType === 'quiz')?.config as
    | QuizGlobalConfig
    | undefined;
  const mode = config?.buildingDefaults?.[buildingId]?.handRaiseMode;
  return isMode(mode) ? mode : DEFAULT_QUIZ_HAND_RAISE_MODE;
};

/**
 * `force-on`/`force-off` win outright; otherwise the teacher's per-quiz
 * checkbox decides, and its default is off.
 */
export const resolveQuizHandRaiseEnabled = (
  mode: QuizHandRaiseMode,
  teacherChoice: boolean | undefined
): boolean => {
  if (mode === 'force-on') return true;
  if (mode === 'force-off') return false;
  return teacherChoice === true;
};
