import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, DiceConfig } from '@/types';
import { Dices, Hash, Palette, Circle } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';

export const DiceSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const config = widget.config as DiceConfig;
  const { updateWidget } = useDashboard();
  const count = config.count ?? 1;
  const diceColor = config.diceColor ?? '#ffffff';
  const dotColor = config.dotColor ?? '#1e293b';

  const updateConfig = (updates: Partial<DiceConfig>) => {
    updateWidget(widget.id, {
      config: { ...config, ...updates } as DiceConfig,
    });
  };

  const diceColorId = `dice-color-${widget.id}`;
  const dotColorId = `dot-color-${widget.id}`;

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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <SettingsLabel icon={Palette} htmlFor={diceColorId}>
            Die Color
          </SettingsLabel>
          <div className="relative group">
            <input
              id={diceColorId}
              type="color"
              value={diceColor}
              onChange={(e) => updateConfig({ diceColor: e.target.value })}
              className="w-full h-10 rounded-xl cursor-pointer border-2 border-slate-100 hover:border-purple-200 transition-colors"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] bg-white/90 px-2 py-1 rounded-md shadow-sm border border-slate-100 font-bold uppercase">
                Change
              </span>
            </div>
          </div>
        </div>
        <div>
          <SettingsLabel icon={Circle} htmlFor={dotColorId}>
            Pip Color
          </SettingsLabel>
          <div className="relative group">
            <input
              id={dotColorId}
              type="color"
              value={dotColor}
              onChange={(e) => updateConfig({ dotColor: e.target.value })}
              className="w-full h-10 rounded-xl cursor-pointer border-2 border-slate-100 hover:border-purple-200 transition-colors"
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] bg-white/90 px-2 py-1 rounded-md shadow-sm border border-slate-100 font-bold uppercase">
                Change
              </span>
            </div>
          </div>
        </div>
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
