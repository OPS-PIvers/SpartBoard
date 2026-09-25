import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';

export const ActivityWallManagedField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => (
  <div
    id={ctx.id}
    role="note"
    aria-labelledby={ctx.labelId}
    className="space-y-2 text-sm text-slate-600"
  >
    <p className="font-semibold text-slate-700">
      {ctx.t('widgetSettings.activity-wall.wallsManaged')}
    </p>
    <p>{ctx.t('widgetSettings.activity-wall.wallsHelp')}</p>
  </div>
);
