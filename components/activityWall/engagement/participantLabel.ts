import type { ActivityWallIdentificationMode } from '@/types';

/** The only label a name-hidden wall stores; the create rules refuse any other from students. */
export const ANONYMOUS_PARTICIPANT_LABEL = 'Anonymous';

/** Masks a student-written label to the placeholder when the wall hides names. */
export const labelForWall = (
  showNames: boolean | undefined,
  label: string
): string => (showNames === true ? label : ANONYMOUS_PARTICIPANT_LABEL);

/** Display label for a like/comment author, derived from the wall's identification mode. */
export const buildParticipantLabel = (
  identificationMode: ActivityWallIdentificationMode,
  name: string,
  pin: string
): string => {
  if (identificationMode === 'name') return name.trim() || 'Visitor';
  if (identificationMode === 'pin') return `PIN: ${pin.trim()}`;
  if (identificationMode === 'name-pin')
    return `${name.trim()} (${pin.trim()})`;
  return 'Anonymous';
};
