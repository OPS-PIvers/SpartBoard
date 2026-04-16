import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, DiceConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { RefreshCw } from 'lucide-react';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { DiceFace } from './components/DiceFace';
import { getDiceAudioCtx, playRollSound } from './utils/audio';

export const DiceWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { activeDashboard, updateWidget } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const config = widget.config as DiceConfig;
  const diceCount = config.count ?? 1;
  const { diceColor = '#ffffff', dotColor = '#1e293b' } = config;

  const [values, setValues] = useState<number[]>(() =>
    config.lastRoll?.length === diceCount
      ? config.lastRoll
      : new Array<number>(diceCount).fill(1)
  );
  const [prevDiceCount, setPrevDiceCount] = useState(diceCount);
  const [isRolling, setIsRolling] = useState(false);
  // Ref so the remote-sync effect can read the current isRolling without
  // listing it as a dependency (avoids overwriting locally-rolled values
  // when the local roll finishes and isRolling flips back to false).
  const isRollingRef = useRef(false);
  isRollingRef.current = isRolling;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isRollingRef.current && config.lastRoll?.length === diceCount) {
      setValues(config.lastRoll);
    }
  }, [config.lastRoll, diceCount]);

  const roll = async () => {
    if (isRolling) return;

    const ctx = getDiceAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    setIsRolling(true);
    let rolls = 0;
    const maxRolls = 12;

    intervalRef.current = setInterval(() => {
      setValues((prev) => prev.map(() => Math.floor(Math.random() * 6) + 1));
      playRollSound();
      rolls++;

      if (rolls >= maxRolls) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        const finalValues = Array.from(
          { length: diceCount },
          () => Math.floor(Math.random() * 6) + 1
        );
        setValues(finalValues);
        updateWidget(widget.id, {
          config: { ...config, lastRoll: finalValues } as DiceConfig,
        });
        setIsRolling(false);
      }
    }, 80);
  };

  if (diceCount !== prevDiceCount || values.length !== diceCount) {
    if (diceCount !== prevDiceCount) setPrevDiceCount(diceCount);
    setValues(
      Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1)
    );
  }

  const getGridCols = () => {
    if (diceCount === 1) return 'grid-cols-1';
    if (diceCount === 2) return 'grid-cols-2';
    if (diceCount === 3) return 'grid-cols-3';
    if (diceCount === 4) return 'grid-cols-2';
    return 'grid-cols-3';
  };

  const getDiceSize = () => {
    if (diceCount === 1) return '75cqmin';
    if (diceCount === 2) return '50cqmin';
    if (diceCount === 3) return '38cqmin';
    if (diceCount === 4) return '42cqmin';
    return '30cqmin';
  };

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={[
            'grid',
            getGridCols(),
            'justify-items-center',
            'items-center',
            'w-full',
            'h-full',
            'overflow-hidden',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ gap: '4cqmin', padding: '6cqmin' }}
        >
          {values.map((v, i) => (
            <DiceFace
              key={i}
              value={v}
              isRolling={isRolling}
              diceColor={diceColor}
              dotColor={dotColor}
              size={getDiceSize()}
            />
          ))}
        </div>
      }
      footer={
        <div className="px-3 pb-3">
          <button
            onClick={roll}
            disabled={isRolling}
            className={`
            w-full py-4 px-6 flex items-center justify-center gap-3 rounded-2xl uppercase tracking-widest transition-all font-black font-${
              globalStyle.fontFamily
            }
            ${
              isRolling
                ? 'bg-slate-100 text-slate-400'
                : 'bg-purple-600 text-white shadow-lg hover:bg-purple-700 active:scale-90 hover:shadow-purple-500/30'
            }
          `}
            style={{ fontSize: '20px' }}
          >
            <RefreshCw
              style={{ width: '1.2em', height: '1.2em' }}
              className={isRolling ? 'animate-spin' : ''}
            />
            {isRolling ? 'Rolling...' : 'Roll Dice'}
          </button>
        </div>
      }
    />
  );
};
