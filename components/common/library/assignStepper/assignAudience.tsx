// Audience state for the assign dialogs: Students, or Staff with the staff-audience flag.
import { useContext, useState } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import {
  STAFF_AUDIENCE_FEATURE,
  type AssignmentAudience,
} from '@/utils/staffAudience';
import { AssignAudienceSwitch } from './AssignAudienceSwitch';
import type { AssignStepDef } from './assignSteps';

export const STAFF_AUDIENCE_VALUE = 'Staff (district sign-in)';

export interface AssignAudienceState {
  audience: AssignmentAudience;
  setAudience: (value: AssignmentAudience) => void;
  canAssignToStaff: boolean;
}

/** The dialog's audience; always Students for a teacher without the flag. */
export function useAssignAudience(): AssignAudienceState {
  const auth = useContext(AuthContext);
  const canAssignToStaff = !!auth?.canAccessFeature(STAFF_AUDIENCE_FEATURE);
  const [picked, setAudience] = useState<AssignmentAudience>('students');
  return {
    audience: canAssignToStaff ? picked : 'students',
    setAudience,
    canAssignToStaff,
  };
}

/** Puts the switch above a Classes step; Staff hides the class pickers, since staff join by sign-in. */
export function withAudienceSwitch(
  step: AssignStepDef,
  state: AssignAudienceState
): AssignStepDef {
  if (!state.canAssignToStaff) return step;
  const staff = state.audience === 'staff';
  return {
    ...step,
    value: staff ? STAFF_AUDIENCE_VALUE : step.value,
    body: (
      <div className="space-y-3">
        <AssignAudienceSwitch
          value={state.audience}
          onChange={state.setAudience}
        />
        {!staff && step.body}
      </div>
    ),
  };
}
