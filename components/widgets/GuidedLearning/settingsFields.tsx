import React from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { tourAttr } from '@/config/tourAnchors';

export const GuidedLearningLibraryField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => (
  <button
    id={ctx.id}
    type="button"
    onClick={() => ctx.updateConfig({ view: 'library' })}
    aria-labelledby={ctx.labelId}
    aria-describedby={ctx.describedBy}
    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
    {...tourAttr(
      'widget-settings.guided-learning.library',
      ctx.widget.id,
      ctx.widget.type
    )}
  >
    {ctx.t('widgetSettings.guided-learning.goToLibrary')}
  </button>
);
