import React, { useMemo } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, DiceConfig, DiceGlobalConfig } from '@/types';
import { Dices, Hash, Type, Image as ImageIcon } from 'lucide-react';
import { SettingsLabel } from '@/components/common/SettingsLabel';

export const DiceSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const config = widget.config as DiceConfig;
  const { updateWidget } = useDashboard();
  const { featurePermissions } = useAuth();
  const count = config.count ?? 1;

  const diceConfig = useMemo(() => {
    const p = featurePermissions?.find((p) => p.widgetType === 'dice');
    return (p?.config ?? {}) as unknown as DiceGlobalConfig;
  }, [featurePermissions]);

  const customDice = diceConfig.customDice ?? [];

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

      {customDice.length > 0 && (
        <div>
          <SettingsLabel icon={Dices}>Die Type</SettingsLabel>
          <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            <button
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, activeDieId: undefined } as DiceConfig,
                })
              }
              className={`
                flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all text-left
                ${
                  !config.activeDieId
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-100 text-slate-500 hover:border-slate-200 bg-white'
                }
              `}
            >
              <Dices className="h-5 w-5 mb-1" />
              <div className="text-xs font-bold truncate w-full text-center">
                Standard Numbers
              </div>
            </button>
            {customDice.map((die) => (
              <button
                key={die.id}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, activeDieId: die.id } as DiceConfig,
                  })
                }
                className={`
                  flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all text-left
                  ${
                    config.activeDieId === die.id
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-slate-100 text-slate-500 hover:border-slate-200 bg-white'
                  }
                `}
              >
                {die.type === 'text' ? (
                  <Type className="h-5 w-5 mb-1" />
                ) : (
                  <ImageIcon className="h-5 w-5 mb-1" />
                )}
                <div className="text-xs font-bold truncate w-full text-center">
                  {die.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
        <SettingsLabel icon={Dices} className="text-purple-700 mb-2">
          Instructions
        </SettingsLabel>
        <p className="text-xxs text-purple-600 leading-relaxed ">
          Select the number of dice and optionally choose a custom die from the
          library. The dice will scale automatically to fit the window.
        </p>
      </div>
    </div>
  );
};
