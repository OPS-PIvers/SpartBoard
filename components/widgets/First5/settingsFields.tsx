import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { ManagedNotice } from '@/components/settings/ManagedNotice';
import { useFirst5Url } from './hooks/useFirst5Url';

export const First5ManagedField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { url } = useFirst5Url();

  return (
    <ManagedNotice
      ctx={ctx}
      text={ctx.t('widgetSettings.first-5.automaticHelp')}
    >
      {url && (
        <p className="break-all text-xs text-slate-500">
          {ctx.t('widgetSettings.first-5.currentUrl', { url })}
        </p>
      )}
    </ManagedNotice>
  );
};
