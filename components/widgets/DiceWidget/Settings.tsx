import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, DiceConfig } from '@/types';
import { Dices, Hash, Palette, Circle } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';

export const DiceSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const config = widget.config as DiceConfig;
  const { updateWidget } = useDashboard();
  const count = config.count ?? 1;

  const updateConfig = (updates: Partial<DiceConfig>) => {
    updateWidget(widget.id, {
      config: { ...config, ...updates } as DiceConfig,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel icon={Hash}>Number of Dice</SettingsLabel>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => updateConfig({ count: n })}
              className={`
                flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all
                ${
                  count === n
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-100 text-slate-400 hover:border-slate-200'
                }
              `}
            >
              <span className="text-lg font-bold ">{n}</span>
              <span className="text-[10px] uppercase font-black">
                {n === 1 ? 'Die' : 'Dice'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <SurfaceColorSettings
          label="Die Color"
          icon={Palette}
          config={{ ...config, cardColor: config.diceColor ?? '#ffffff' }}
          updateConfig={(updates) =>
            updateConfig({ diceColor: updates.cardColor })
          }
        />

        <SurfaceColorSettings
          label="Pip Color"
          icon={Circle}
          config={{ ...config, cardColor: config.dotColor ?? '#1e293b' }}
          updateConfig={(updates) =>
            updateConfig({ dotColor: updates.cardColor })
          }
        />
      </div>

      <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
        <SettingsLabel icon={Dices} className="text-purple-700 mb-2">
          Instructions
        </SettingsLabel>
        <p className="text-xxs text-purple-600 leading-relaxed font-medium">
          Select between 1 and 6 dice and customize their appearance to match
          your classroom theme. The dice scale automatically to fit your screen.
        </p>
      </div>
    </div>
  );
};
