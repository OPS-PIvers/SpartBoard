/** Admin write of one type's preset, and for PLC the goal-coach rubric, to `admin_settings/team_type_defaults`. */

import { deleteField, doc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { TEAM_TYPE_DEFAULTS_SETTINGS_DOC } from '@/config/teamTypePresets';
import { GOAL_COACH_RUBRIC_FIELD } from '@/config/goalCoachRubric';
import type { GoalCoachCriterion, PlcGroupType, TeamTypePreset } from '@/types';
import { isDefaultRubric, presetToFirestore } from './teamTypeDefaultsModel';

/** `rubric` undefined leaves the stored rubric alone; the default rubric clears the override. */
export async function saveTeamTypeDefaults(
  type: PlcGroupType,
  preset: TeamTypePreset,
  rubric?: GoalCoachCriterion[]
): Promise<void> {
  const data: Record<string, unknown> = {
    types: { [type]: presetToFirestore(preset) },
  };
  const mergeFields = [`types.${type}`];
  if (rubric) {
    data[GOAL_COACH_RUBRIC_FIELD] =
      rubric.length === 0 || isDefaultRubric(rubric) ? deleteField() : rubric;
    mergeFields.push(GOAL_COACH_RUBRIC_FIELD);
  }
  await setDoc(
    doc(db, 'admin_settings', TEAM_TYPE_DEFAULTS_SETTINGS_DOC),
    data,
    { mergeFields }
  );
}
