import type {
  ActivityWallGlobalConfig,
  ActivityWallIdentificationMode,
  ActivityWallMode,
  FeaturePermission,
} from '@/types';
import { canonicalizeBuildingKeyedRecord } from '@/config/buildings';

/**
 * The subset of {@link ActivityWallActivity} fields an admin can pre-seed via
 * the per-building Activity Wall defaults. These are *activity-level* defaults
 * (applied when a teacher authors a new activity), not *widget-instance* config,
 * which is why they are resolved here at activity-creation time rather than
 * through `getAdminBuildingConfig()` (that helper only seeds new widget config).
 */
export interface ActivityWallActivityDefaults {
  mode?: ActivityWallMode;
  moderationEnabled?: boolean;
  identificationMode?: ActivityWallIdentificationMode;
}

const VALID_MODES: readonly ActivityWallMode[] = ['text', 'photo'];
const VALID_IDENTIFICATION_MODES: readonly ActivityWallIdentificationMode[] = [
  'anonymous',
  'name',
  'pin',
  'name-pin',
];

/**
 * Resolves the per-building Activity Wall defaults an admin configured in
 * `ActivityWallConfigurationPanel` — stored on
 * `feature_permissions/activity-wall` as
 * `config.buildingDefaults[buildingId]` — into the activity-level fields used
 * to seed a *new* activity.
 *
 * Mirrors `getAdminBuildingConfig()` conventions: keys are canonicalized so
 * legacy building IDs still resolve, only the first selected building is used,
 * and persisted values are validated so a malformed Firestore document can't
 * push an unrenderable mode/identification value into the editor. Returns an
 * empty object when no building is selected or no matching defaults exist.
 */
export const resolveActivityWallBuildingDefaults = (
  featurePermissions: FeaturePermission[],
  selectedBuildings: string[]
): ActivityWallActivityDefaults => {
  if (!selectedBuildings.length) return {};
  const buildingId = selectedBuildings[0];
  const perm = featurePermissions.find((p) => p.widgetType === 'activity-wall');
  const rawBuildingDefaults = (
    perm?.config as ActivityWallGlobalConfig | undefined
  )?.buildingDefaults;
  if (!rawBuildingDefaults) return {};
  const buildingDefaults = canonicalizeBuildingKeyedRecord(rawBuildingDefaults);
  const raw = buildingDefaults[buildingId];
  if (!raw) return {};

  const out: ActivityWallActivityDefaults = {};
  if (raw.defaultMode && VALID_MODES.includes(raw.defaultMode)) {
    out.mode = raw.defaultMode;
  }
  if (
    raw.defaultIdentificationMode &&
    VALID_IDENTIFICATION_MODES.includes(raw.defaultIdentificationMode)
  ) {
    out.identificationMode = raw.defaultIdentificationMode;
  }
  if (typeof raw.defaultModerationEnabled === 'boolean') {
    out.moderationEnabled = raw.defaultModerationEnabled;
  }
  return out;
};
