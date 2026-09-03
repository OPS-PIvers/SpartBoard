import type { ActivityWallIdentificationMode } from '@/types';

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
