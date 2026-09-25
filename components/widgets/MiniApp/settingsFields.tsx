import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { ManagedNotice } from '@/components/settings/ManagedNotice';

export const MiniAppManageNotice: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => (
  <ManagedNotice ctx={ctx} text={ctx.t('widgetSettings.miniApp.manageHelp')} />
);
