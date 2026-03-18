import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, ExpectationsConfig } from '@/types';
import { LayoutGrid, LayoutList } from 'lucide-react';

const LAYOUTS: {
  id: 'secondary' | 'elementary';
  label: string;
  icon: typeof LayoutList;
}[] = [
  { id: 'secondary', label: 'Secondary', icon: LayoutList },
  { id: 'elementary', label: 'Elementary', icon: LayoutGrid },
];

export const ExpectationsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as ExpectationsConfig;

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          Layout Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    layout: l.id,
                  },
                })
              }
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                (config.layout ?? 'secondary') === l.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
              }`}
            >
              <l.icon size={20} />
              <span className="text-xxs font-bold uppercase tracking-tight">
                {l.label}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xxxs text-slate-400 leading-relaxed">
          Secondary uses a single column list. Elementary uses a two-column
          grid.
        </p>
      </div>

      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          Nexus Connections
        </label>
        <button
          onClick={() => {
            const isActive = !config.syncSoundWidget;

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
                    (w.config as import('@/types').ExpectationsConfig)
                      .syncSoundWidget
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
          }}
          className={`w-full p-4 rounded-xl border-2 flex items-center justify-between transition-all ${
            config.syncSoundWidget
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
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
          <div
            className={`w-10 h-6 rounded-full p-1 transition-colors duration-300 ${
              config.syncSoundWidget ? 'bg-indigo-500' : 'bg-slate-200'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                config.syncSoundWidget ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </div>
        </button>
      </div>
    </div>
  );
};
