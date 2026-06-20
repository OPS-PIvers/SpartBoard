import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, ExpectationsConfig } from '@/types';
import { Toggle } from '@/components/common/Toggle';

export const ExpectationsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as ExpectationsConfig;

  const handleSyncToggle = (isActive: boolean) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        syncSoundWidget: isActive,
      },
    });

    if (!activeDashboard) {
      return;
    }

    // If activating sync, ensure no other Expectations widget is also syncing.
    if (isActive) {
      activeDashboard.widgets
        .filter(
          (w) =>
            w.type === 'expectations' &&
            w.id !== widget.id &&
            (w.config as import('@/types').ExpectationsConfig).syncSoundWidget
        )
        .forEach((w) => {
          updateWidget(w.id, {
            config: {
              ...w.config,
              syncSoundWidget: false,
            } as import('@/types').ExpectationsConfig,
          });
        });
    }

    // Update all sound widgets. With the logic above, `isActive` is the correct
    // state for `syncExpectations` on all sound widgets.
    const soundWidgets = activeDashboard.widgets.filter(
      (w) => w.type === 'sound'
    );
    soundWidgets.forEach((w) => {
      updateWidget(w.id, {
        config: {
          ...w.config,
          syncExpectations: isActive,
        } as import('@/types').SoundConfig,
      });
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          Nexus Connections
        </label>
        <div
          className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
            config.syncSoundWidget
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-slate-100 bg-white text-slate-500'
          }`}
        >
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-bold tracking-tight">
              Auto-Adjust Sound Meter
            </span>
            <span className="text-xxs text-slate-500 text-left leading-tight">
              Automatically adjust Sound widget sensitivity based on the current
              Voice Level expectation.
            </span>
          </div>
          <Toggle
            checked={config.syncSoundWidget ?? false}
            onChange={handleSyncToggle}
            label="Auto-Adjust Sound Meter"
            size="sm"
            activeColor="bg-indigo-500"
            showLabels={false}
          />
        </div>
      </div>
    </div>
  );
};
