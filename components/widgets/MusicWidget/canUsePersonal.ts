import type { FieldCtx } from '@/components/settings/schema/types';

export const canUsePersonal = (ctx: FieldCtx) =>
  ctx.profileLoaded !== true || ctx.canAccessFeature('personal-spotify');
