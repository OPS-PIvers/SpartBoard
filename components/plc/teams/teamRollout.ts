// Rollout helpers (T3, T35): freeze a team's layout so later admin default edits only reach new teams.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { TEAM_TYPE_DEFAULTS_SETTINGS_DOC } from '@/config/teamTypePresets';
import type {
  Plc,
  PlcGroupType,
  PlcTeamLayout,
  TeamTypeDefaults,
} from '@/types';
import {
  normalizeTeamTypeDefaults,
  resolveTeamLayout,
  toStoredTeamLayout,
} from '@/utils/teamLayout';

/** The district default for a team's type, ignoring its own layout and old section switches. */
export function districtDefaultLayout(
  plc: Pick<Plc, 'groupType'>,
  adminDefaults: TeamTypeDefaults | null
): PlcTeamLayout {
  const bare = { groupType: plc.groupType } as Plc;
  return toStoredTeamLayout(resolveTeamLayout(bare, adminDefaults));
}

/** The layout a new team is created with. */
export function newTeamLayout(
  groupType: PlcGroupType,
  adminDefaults: TeamTypeDefaults | null
): PlcTeamLayout {
  return districtDefaultLayout({ groupType }, adminDefaults);
}

/** One read of the admin defaults; built-in presets stand in when it fails. */
export async function fetchTeamTypeDefaults(): Promise<TeamTypeDefaults | null> {
  try {
    const snap = await getDoc(
      doc(db, 'admin_settings', TEAM_TYPE_DEFAULTS_SETTINGS_DOC)
    );
    return snap.exists() ? normalizeTeamTypeDefaults(snap.data()) : null;
  } catch {
    return null;
  }
}
