import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { First5Icon } from './First5Icon';
import { useFirst5Url } from './hooks/useFirst5Url';

export const First5ManagedField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { url } = useFirst5Url();

  return (
    <div
      id={ctx.id}
      role="note"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-center"
    >
      <First5Icon className="h-6 w-6 text-slate-400" />
      <p className="text-sm leading-relaxed text-slate-600">
        {ctx.t('widgetSettings.first-5.automaticHelp')}
      </p>
      {url && (
        <p className="break-all text-xs text-slate-500">
          {ctx.t('widgetSettings.first-5.currentUrl', { url })}
        </p>
      )}
    </div>
  );
};
