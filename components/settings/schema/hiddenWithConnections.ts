import type { FieldCtx } from './types';

// An old widget-to-widget toggle that Connections replace; hidden from teachers who have Connections.
export const hiddenWithConnections = (ctx: FieldCtx): boolean =>
  !ctx.canAccessFeature('widget-connections');
