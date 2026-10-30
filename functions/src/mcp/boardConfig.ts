// Builds a new widget's config the way the app's addWidget does, and checks the teacher may add it (AI_BOARDS D14, D15).
import type * as admin from '../firebaseAdmin';
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
  materialsPreferences?: Doc;
  /** Filled on first use so a board of gated widgets reads tier and beta grants once. */
  cache?: { tier?: Promise<string>; beta?: Map<string, Promise<boolean>> };
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
  const rawMaterials: unknown = data.materialsPreferences;
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
    ...(isObject(rawMaterials) ? { materialsPreferences: rawMaterials } : {}),
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
  const cache = (ctx.cache ??= {});
  const tier = () =>
    (cache.tier ??= ctx.email
      ? archive.deriveTeacherTier(ctx.db, ctx.email)
      : Promise.resolve('free'));
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
    const beta = (cache.beta ??= new Map());
    if (!beta.has(type))
      beta.set(type, archive.isBetaTeacher(ctx.db, betaUsers, ctx.email));
    if (!(await beta.get(type))) return noAccess;
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
  /** Account-wide Materials picks, which addWidget seeds under Claude's settings. */
  materialsPreferences?: Doc;
}

/** The two account layers for one widget type, read the same way addWidget reads them. */
export function widgetConfigSources(
  ctx: Pick<
    WidgetAccessContext,
    | 'featurePermissions'
    | 'selectedBuildings'
    | 'savedWidgetConfigs'
    | 'materialsPreferences'
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
    ...(type === 'materials' && ctx.materialsPreferences
      ? { materialsPreferences: ctx.materialsPreferences }
      : {}),
  };
}

export type BuiltWidgetConfig =
  { ok: true; config: Doc } | { ok: false; errors: string[] };

/** Fields that only make sense together, kept consistent the way the app's own panels keep them. */
export function reconcile(type: string, claude: Doc, config: Doc): Doc {
  if (type !== 'time-tool') return config;
  const touchesTimer = 'duration' in claude || 'mode' in claude;
  if (!touchesTimer || 'elapsedTime' in claude) return config;
  const duration = typeof config.duration === 'number' ? config.duration : 0;
  // Like the app's setTime: a new length stops a running timer instead of resuming from its old start.
  return {
    ...config,
    elapsedTime: config.mode === 'stopwatch' ? 0 : duration,
    isRunning: false,
    startTime: null,
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
    type === 'materials'
      ? {
          ...WIDGET_CONFIG_RUNTIME.seedMaterialsConfig(
            sources.materialsPreferences
          ),
          ...checked.settings,
        }
      : checked.settings
  );
  return {
    ok: true,
    config: structuredClone(reconcile(type, checked.settings, merged)),
  };
}
