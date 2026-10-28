// Builds a new widget's config the way the app's addWidget does, and checks the teacher may add it (AI_BOARDS D14, D15).
import type * as admin from 'firebase-admin';
import {
  canonicalBuildingIdServer,
  canonicalizeBuildingIdsServer,
} from '../buildingIds';
import { WIDGET_CONFIG_RUNTIME } from './widgetConfigRuntime.gen';
import { WIDGET_TYPE_LIST } from './widgetTypeList';
import { checkWidgetSettings, hasWidgetSchema } from './widgetConfigValidator';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

const isObject = (value: unknown): value is Doc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const APPEARANCE_KEYS: ReadonlySet<string> = new Set(
  WIDGET_CONFIG_RUNTIME.appearanceKeys
);

/** What one read of the teacher's account gives every widget built in a call. */
export interface WidgetAccessContext {
  db: Firestore;
  uid: string;
  email: string;
  isAdmin: boolean;
  featurePermissions: Doc[];
  selectedBuildings: string[];
  savedWidgetConfigs: Record<string, Doc>;
}

export async function loadWidgetAccessContext(
  db: Firestore,
  uid: string,
  email: string
): Promise<WidgetAccessContext> {
  const lower = email.toLowerCase();
  const [adminDoc, perms, profile] = await Promise.all([
    lower ? db.collection('admins').doc(lower).get() : null,
    db.collection('feature_permissions').get(),
    db.doc(`users/${uid}/userProfile/profile`).get(),
  ]);
  const data = profile.data() ?? {};
  const rawBuildings: unknown = data.selectedBuildings;
  const rawSaved: unknown = data.savedWidgetConfigs;
  return {
    db,
    uid,
    email: lower,
    isAdmin: !!adminDoc?.exists,
    featurePermissions: perms.docs.map((d) => d.data()),
    selectedBuildings: Array.isArray(rawBuildings)
      ? canonicalizeBuildingIdsServer(rawBuildings)
      : [],
    savedWidgetConfigs: isObject(rawSaved)
      ? (Object.fromEntries(
          Object.entries(rawSaved).filter(([, v]) => isObject(v))
        ) as Record<string, Doc>)
      : {},
  };
}

export type WidgetAccess =
  | { ok: true }
  | {
      ok: false;
      reason: 'unknown' | 'disabled' | 'no-access';
      message: string;
    };

/** Mirrors canAccessWidget in context/AuthContext.tsx, including the building and tier gates. */
export async function canUseWidget(
  ctx: WidgetAccessContext,
  type: string
): Promise<WidgetAccess> {
  if (!WIDGET_TYPE_LIST.includes(type) || !hasWidgetSchema(type))
    return {
      ok: false,
      reason: 'unknown',
      message: `"${type}" is not a widget teachers can add to a board`,
    };
  const noAccess: WidgetAccess = {
    ok: false,
    reason: 'no-access',
    message: `This teacher doesn't have the "${type}" widget`,
  };
  // Lazy: quizMediaArchive pulls heavy deps the other tools don't need.
  const archive = await import('../quizMediaArchive');
  if (
    type === 'routineGuide' &&
    !(await archive.isGlobalFeatureGranted(
      ctx.db,
      'routine-guide',
      ctx.email,
      ctx.uid
    ))
  )
    return noAccess;
  const tier = async () =>
    ctx.email ? archive.deriveTeacherTier(ctx.db, ctx.email) : 'free';
  const perm = ctx.featurePermissions.find((p) => p.widgetType === type);
  if (!perm) {
    if (ctx.isAdmin) return { ok: true };
    if (WIDGET_CONFIG_RUNTIME.accessLevels[type] === 'admin') return noAccess;
    return archive.meetsMinTierServer(
      await tier(),
      WIDGET_CONFIG_RUNTIME.minTiers[type]
    )
      ? { ok: true }
      : noAccess;
  }
  if (perm.enabled !== true)
    return {
      ok: false,
      reason: 'disabled',
      message: `The "${type}" widget is turned off in this district`,
    };
  if (ctx.isAdmin) return { ok: true };
  if (perm.accessLevel === 'beta') {
    const betaUsers = Array.isArray(perm.betaUsers) ? perm.betaUsers : [];
    if (!(await archive.isBetaTeacher(ctx.db, betaUsers, ctx.email)))
      return noAccess;
  } else if (perm.accessLevel !== 'public') {
    return noAccess;
  }
  if (
    perm.minTier !== undefined &&
    perm.minTier !== null &&
    !archive.meetsMinTierServer(await tier(), perm.minTier)
  )
    return noAccess;
  const config = isObject(perm.config) ? perm.config : {};
  const dockDefaults = isObject(config.dockDefaults)
    ? config.dockDefaults
    : null;
  if (dockDefaults && ctx.selectedBuildings.length > 0) {
    // Same as canonicalizeBuildingKeyedRecord: the later of a legacy and canonical key wins.
    const canonical = Object.create(null) as Doc;
    for (const [id, on] of Object.entries(dockDefaults))
      canonical[canonicalBuildingIdServer(id)] = on;
    if (ctx.selectedBuildings.every((b) => canonical[b] === false))
      return noAccess;
  }
  return { ok: true };
}

export interface WidgetConfigSources {
  /** The admin's per-building defaults, already resolved for the teacher's building. */
  buildingDefaults?: Doc;
  /** The teacher's saved appearance for this widget type; only APPEARANCE_KEYS are used. */
  savedAppearance?: Doc;
}

/** The two account layers for one widget type, read the same way addWidget reads them. */
export function widgetConfigSources(
  ctx: Pick<
    WidgetAccessContext,
    'featurePermissions' | 'selectedBuildings' | 'savedWidgetConfigs'
  >,
  type: string
): WidgetConfigSources {
  return {
    buildingDefaults: WIDGET_CONFIG_RUNTIME.getAdminBuildingConfig(
      type,
      ctx.featurePermissions,
      ctx.selectedBuildings
    ),
    savedAppearance: ctx.savedWidgetConfigs[type],
  };
}

export type BuiltWidgetConfig =
  { ok: true; config: Doc } | { ok: false; errors: string[] };

/** Fields that only make sense together, kept consistent the way the app's own panels keep them. */
function reconcile(type: string, claude: Doc, config: Doc): Doc {
  if (type !== 'time-tool') return config;
  const touchesTimer = 'duration' in claude || 'mode' in claude;
  if (!touchesTimer || 'elapsedTime' in claude) return config;
  const duration = typeof config.duration === 'number' ? config.duration : 0;
  return {
    ...config,
    elapsedTime: config.mode === 'stopwatch' ? 0 : duration,
  };
}

/** Defaults → admin building defaults → saved appearance (allowlist only) → Claude's settings. */
export function buildWidgetConfig(
  type: string,
  claudeSettings: unknown,
  sources: WidgetConfigSources = {}
): BuiltWidgetConfig {
  const checked = checkWidgetSettings(type, claudeSettings);
  if (!checked.ok) return checked;
  const merged = WIDGET_CONFIG_RUNTIME.mergeWidgetConfig(
    WIDGET_CONFIG_RUNTIME.defaults[type]?.config,
    sources.buildingDefaults,
    sources.savedAppearance,
    checked.settings
  );
  return {
    ok: true,
    config: structuredClone(reconcile(type, checked.settings, merged)),
  };
}
