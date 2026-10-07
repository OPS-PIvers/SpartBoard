/** Team type defaults listener and team layout writes (docs/plans/TEAMS_REDESIGN.md T2, T3). */

import { useEffect, useState } from 'react';
import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { TEAM_TYPE_DEFAULTS_SETTINGS_DOC } from '@/config/teamTypePresets';
import type { PlcTeamLayout, TeamTypeDefaults } from '@/types';
import {
  normalizeTeamTypeDefaults,
  toStoredTeamLayout,
} from '@/utils/teamLayout';

const PLCS_COLLECTION = 'plcs';
const EMPTY_DEFAULTS: TeamTypeDefaults = { types: {} };

export interface TeamTypeDefaultsState {
  /** Null while loading; empty when unset or unreadable. */
  defaults: TeamTypeDefaults | null;
  /** The read failed, so `defaults` is the built-in stand-in. */
  failed: boolean;
}

const LOADING: TeamTypeDefaultsState = { defaults: null, failed: false };

/** Live `admin_settings/team_type_defaults` with whether the read failed. */
export function useTeamTypeDefaultsState(
  enabled: boolean = true
): TeamTypeDefaultsState {
  const [state, setState] = useState<TeamTypeDefaultsState>(LOADING);

  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'admin_settings', TEAM_TYPE_DEFAULTS_SETTINGS_DOC),
      (snap) =>
        setState({
          defaults: snap.exists()
            ? normalizeTeamTypeDefaults(snap.data())
            : EMPTY_DEFAULTS,
          failed: false,
        }),
      // Built-in presets stand in when the read fails.
      () => setState({ defaults: EMPTY_DEFAULTS, failed: true })
    );
  }, [enabled]);

  return state;
}

/** Live `admin_settings/team_type_defaults`; null while loading, empty when unset or unreadable. */
export function useTeamTypeDefaults(
  enabled: boolean = true
): TeamTypeDefaults | null {
  return useTeamTypeDefaultsState(enabled).defaults;
}

/** Lead or co-lead: replace the team layout (rules close the write to layout + updatedAt). */
export async function saveTeamLayout(
  plcId: string,
  layout: PlcTeamLayout
): Promise<void> {
  await updateDoc(doc(db, PLCS_COLLECTION, plcId), {
    layout: toStoredTeamLayout(layout),
    updatedAt: serverTimestamp(),
  });
}

/** Lead or co-lead: "Reset to district default" drops the team layout. */
export async function resetTeamLayout(plcId: string): Promise<void> {
  await updateDoc(doc(db, PLCS_COLLECTION, plcId), {
    layout: deleteField(),
    updatedAt: serverTimestamp(),
  });
}
