import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';

export const TalkingToolManagedField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => (
  <p
    id={ctx.id}
    role="note"
    aria-labelledby={ctx.labelId}
    className="text-sm text-slate-600"
  >
    {ctx.t('widgetSettings.talking-tool.globalContentHelp')}
  </p>
);
