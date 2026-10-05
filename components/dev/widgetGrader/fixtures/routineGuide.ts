import type { FeaturePermission, RoutineGuideRoutine } from '@/types';
import { BUILT_IN_ROUTINE_GUIDE_ROUTINES } from '@/config/routineGuide';
import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const [first] = BUILT_IN_ROUTINE_GUIDE_ROUTINES;

const longRoutine: RoutineGuideRoutine = {
  id: 'grader-long',
  name: STRESS.title,
  gradeLevels: [],
  categoryIds: [],
  icon: 'BookOpen',
  color: 'blue',
  steps: range(STRESS.itemCount, (i) => ({
    id: `grader-long-${i}`,
    label: STRESS.word,
    text: i % 2 === 0 ? STRESS.sentence : STRESS.longLabel(i),
  })),
};

// Admin-defined routines the widget reads through feature_permissions/routineGuide.
const permission: FeaturePermission = {
  widgetType: 'routineGuide',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: { routines: [...BUILT_IN_ROUTINE_GUIDE_ROUTINES, longRoutine] },
};

export const routineGuideFixtures = defineFixtures<'routineGuide'>({
  empty: {
    config: { selectedRoutineId: null, stepIndex: 0, view: 'step' },
  },
  typical: {
    config: {
      selectedRoutineId: first.id,
      stepIndex: 1,
      view: 'step',
      mode: 'display',
    },
  },
  stress: {
    auth: { featurePermissions: [permission] },
    config: {
      selectedRoutineId: longRoutine.id,
      stepIndex: 3,
      view: 'all',
      mode: 'display',
    },
  },
});
