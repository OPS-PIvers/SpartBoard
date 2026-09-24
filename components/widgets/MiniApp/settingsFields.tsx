import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';

export const MiniAppManageNotice: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => (
  <p
    id={ctx.id}
    role="note"
    aria-labelledby={ctx.labelId}
    aria-describedby={ctx.describedBy}
    className="text-sm text-slate-600"
  >
    {ctx.t('widgetSettings.miniApp.manageHelp')}
  </p>
);
