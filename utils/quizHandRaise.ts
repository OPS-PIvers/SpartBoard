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

const mostRestrictive = (
  modes: readonly QuizHandRaiseMode[]
): QuizHandRaiseMode => {
  if (modes.includes('force-off')) return 'force-off';
  if (modes.includes('force-on')) return 'force-on';
  return DEFAULT_QUIZ_HAND_RAISE_MODE;
};

const toIdList = (
  value: readonly string[] | string | null | undefined
): string[] => {
  if (!value) return [];
  const ids = typeof value === 'string' ? [value] : value;
  return ids.filter((id) => typeof id === 'string' && id.length > 0);
};

/**
 * The authoritative building set for the gate: the org membership buildings
 * when the teacher has any, else their self-chosen Profile filter. Membership
 * comes first so clearing `selectedBuildings` in Profile cannot dodge a
 * `force-off` building.
 */
export const resolveGateBuildingIds = (
  membershipBuildingIds: readonly string[] | null | undefined,
  selectedBuildings: readonly string[] | string | null | undefined
): string[] => {
  const membership = toIdList(membershipBuildingIds);
  return membership.length > 0 ? membership : toIdList(selectedBuildings);
};

/**
 * Reads the raise-hand mode off `feature_permissions/quiz.config` across every
 * building the teacher belongs to, most-restrictive-wins: any `force-off`
 * decides, then any `force-on`, else the teacher's choice. Mirrors the
 * multi-building `dockDefaults` gate in AuthContext, and canonicalizes stored
 * keys so legacy building ids still match.
 *
 * When NO building resolves, fall back to the most restrictive mode configured
 * for ANY building rather than failing open to teacher-choice.
 */
export const readQuizHandRaiseMode = (
  permissions: readonly FeaturePermission[] | null | undefined,
  buildingIds: readonly string[] | string | null | undefined
): QuizHandRaiseMode => {
  if (!permissions) return DEFAULT_QUIZ_HAND_RAISE_MODE;

  const config = permissions.find((p) => p.widgetType === 'quiz')?.config as
    | QuizGlobalConfig
    | undefined;
  const rawDefaults = config?.buildingDefaults;
  if (!rawDefaults) return DEFAULT_QUIZ_HAND_RAISE_MODE;
  const buildingDefaults = canonicalizeBuildingKeyedRecord(rawDefaults);

  const ids = toIdList(buildingIds);
  if (ids.length === 0) {
    const configured = Object.values(buildingDefaults)
      .map((entry) => entry?.handRaiseMode)
      .filter(isMode);
    return mostRestrictive(configured);
  }

  const modes = ids.map((id) => {
    const mode = buildingDefaults[canonicalBuildingId(id)]?.handRaiseMode;
    return isMode(mode) ? mode : DEFAULT_QUIZ_HAND_RAISE_MODE;
  });
  return mostRestrictive(modes);
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
