import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, DiceConfig } from '@/types';
import { Dices, Hash } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';

export const DiceSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const config = widget.config as DiceConfig;
  const { updateWidget } = useDashboard();
  const count = config.count ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <SettingsLabel icon={Hash}>Number of Dice</SettingsLabel>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, count: n } as DiceConfig,
                })
              }
              className={`
                flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all
                ${
                  count === n
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-100 text-slate-400 hover:border-slate-200'
                }
              `}
            >
              <span className="text-xl ">{n}</span>
              <span className="text-xxxs  uppercase">
                {n === 1 ? 'Die' : 'Dice'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
        <SettingsLabel icon={Dices} className="text-purple-700 mb-2">
          Instructions
        </SettingsLabel>
        <p className="text-xxs text-purple-600 leading-relaxed ">
          Select between 1 and 3 dice for your classroom activities. The dice
          will scale to fit the window as you add more.
        </p>
      </div>
    </div>
  );
};
