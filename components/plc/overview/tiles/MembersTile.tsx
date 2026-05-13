import React from 'react';
import { Plc } from '@/types';
import { MembersBody } from '../../bodies/MembersBody';

interface MembersTileProps {
  plc: Plc;
}

/**
 * Tile-mode preview of the PLC members. Renders `MembersBody` in compact
 * mode (avatar grid only, no invite form). Fullscreen expansion — wired
 * by `PlcGridLayout` when the `members` kind is in `EXPANDABLE_KINDS` —
 * shows the full `MembersBody` with invite + remove controls (lead-only).
 */
export const MembersTile: React.FC<MembersTileProps> = ({ plc }) => {
  return <MembersBody plc={plc} compact />;
};
