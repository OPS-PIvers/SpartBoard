import React from 'react';
import { Toggle } from '@/components/common/Toggle';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { useDashboard } from '@/context/useDashboard';
import type { ExpectationsConfig, SoundConfig } from '@/types';

export const ExpectationsSoundSyncField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeDashboard, updateWidget } = useDashboard();
  const checked = ctx.config.syncSoundWidget === true;

  const updateSync = (next: boolean) => {
    ctx.updateConfig({ syncSoundWidget: next });
    if (!activeDashboard) return;

    if (next) {
      for (const widget of activeDashboard.widgets) {
        if (
          widget.type === 'expectations' &&
          widget.id !== ctx.widget.id &&
          (widget.config as ExpectationsConfig).syncSoundWidget
        ) {
          updateWidget(widget.id, {
            config: {
              ...widget.config,
              syncSoundWidget: false,
            } as ExpectationsConfig,
          });
        }
      }
    }

    for (const widget of activeDashboard.widgets) {
      if (widget.type === 'sound') {
        updateWidget(widget.id, {
          config: {
            ...widget.config,
            syncExpectations: next,
          } as SoundConfig,
        });
      }
    }
  };

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3"
    >
      <p className="text-xs text-indigo-800">
        {ctx.t('widgetSettings.expectations.soundSyncHelp')}
      </p>
      <Toggle
        checked={checked}
        onChange={updateSync}
        label={ctx.t('widgetSettings.expectations.soundSync')}
        showLabels={false}
        size="sm"
        activeColor="bg-indigo-500"
      />
    </div>
  );
};
