// Resolves the admin raise-hand gate + the per-quiz teacher checkbox into one boolean.
import {
  canonicalBuildingId,
  canonicalizeBuildingKeyedRecord,
} from '@/config/buildings';
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

/**
 * Reads the raise-hand mode off `feature_permissions/quiz.config` across every
 * building the teacher belongs to, most-restrictive-wins: any `force-off`
 * decides, then any `force-on`, else the teacher's choice. Mirrors the
 * multi-building `dockDefaults` gate in AuthContext, and canonicalizes stored
 * keys so legacy building ids still match.
 */
export const readQuizHandRaiseMode = (
  permissions: readonly FeaturePermission[] | null | undefined,
  buildingIds: readonly string[] | string | null | undefined
): QuizHandRaiseMode => {
  if (!permissions || !buildingIds) return DEFAULT_QUIZ_HAND_RAISE_MODE;
  const ids = typeof buildingIds === 'string' ? [buildingIds] : buildingIds;
  if (ids.length === 0) return DEFAULT_QUIZ_HAND_RAISE_MODE;

  const config = permissions.find((p) => p.widgetType === 'quiz')?.config as
    | QuizGlobalConfig
    | undefined;
  const rawDefaults = config?.buildingDefaults;
  if (!rawDefaults) return DEFAULT_QUIZ_HAND_RAISE_MODE;
  const buildingDefaults = canonicalizeBuildingKeyedRecord(rawDefaults);

  const modes = ids.map((id) => {
    const mode = buildingDefaults[canonicalBuildingId(id)]?.handRaiseMode;
    return isMode(mode) ? mode : DEFAULT_QUIZ_HAND_RAISE_MODE;
  });
  if (modes.includes('force-off')) return 'force-off';
  if (modes.includes('force-on')) return 'force-on';
  return DEFAULT_QUIZ_HAND_RAISE_MODE;
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
