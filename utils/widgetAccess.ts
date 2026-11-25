// Single widget-permission decision shared by AuthContext.canAccessWidget and Dock seeding.
import type {
  FeaturePermission,
  InternalToolType,
  UserTier,
  WidgetType,
} from '@/types';
import { canonicalizeBuildingIds } from '@/config/buildings';
import {
  getWidgetDefaultAccessLevel,
  WIDGET_DEFAULT_MIN_TIER,
} from '@/config/featureDefaults';
import { isExcludedUser } from '@/utils/betaAccess';
import { meetsMinTier } from '@/utils/userTier';

export interface WidgetAccessContext {
  isAdmin: boolean | null;
  email: string | null | undefined;
  /** Beta-list check that already folds in the caller's roles. */
  isBetaUser: (
    betaUsers: string[],
    email: string | null | undefined
  ) => boolean;
  userTier: UserTier;
  selectedBuildings: readonly string[];
}

/** Whether the signed-in user may open a widget, given its permission doc (if any). */
export function resolveWidgetAccess(
  widgetType: WidgetType | InternalToolType,
  permission: FeaturePermission | undefined,
  ctx: WidgetAccessContext
): boolean {
  // No doc: public unless the widget defaults to admin-only; Google-backed widgets keep a tier floor.
  if (!permission) {
    if (ctx.isAdmin) return true;
    if (getWidgetDefaultAccessLevel(widgetType) === 'admin') return false;
    return meetsMinTier(
      ctx.userTier,
      WIDGET_DEFAULT_MIN_TIER[widgetType as WidgetType]
    );
  }

  // Disabled and excluded beat admin status.
  if (!permission.enabled) return false;
  if (isExcludedUser(permission.excludedUsers, ctx.email)) return false;
  if (ctx.isAdmin) return true;

  switch (permission.accessLevel) {
    case 'admin':
      return false;
    case 'beta':
      if (!ctx.isBetaUser(permission.betaUsers, ctx.email)) return false;
      break;
    case 'public':
      break;
    default:
      return false;
  }

  if (!meetsMinTier(ctx.userTier, permission.minTier)) return false;

  // Dock defaults only seed a new dock; `buildings` is the per-building switch.
  if (permission.buildings && permission.buildings.length > 0) {
    const allowed = new Set(canonicalizeBuildingIds(permission.buildings));
    if (!ctx.selectedBuildings.some((b) => allowed.has(b))) return false;
  }
  return true;
}
