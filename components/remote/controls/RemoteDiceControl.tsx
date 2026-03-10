import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Dices } from 'lucide-react';
import { WidgetData, DiceConfig } from '@/types';

interface RemoteDiceControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const DOT_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const DieFace: React.FC<{ value: number; size?: number }> = ({
  value,
  size = 80,
}) => {
  const dots = DOT_POSITIONS[value] ?? [];
  return (
    <div
      className="rounded-xl bg-white flex items-center justify-center shadow-md"
      style={{ width: size, height: size }}
    >
      <div
        className="grid grid-cols-3 grid-rows-3"
        style={{ width: size * 0.7, height: size * 0.7, gap: size * 0.05 }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            {dots.includes(i) && (
              <div
                className="rounded-full bg-slate-800"
                style={{
                  width: size * 0.14,
                  height: size * 0.14,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export const RemoteDiceControl: React.FC<RemoteDiceControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as DiceConfig;
  const count = Math.min(6, Math.max(1, config.count ?? 1));

  const [values, setValues] = useState<number[]>(() =>
    config.lastRoll?.length === count
      ? config.lastRoll
      : Array.from({ length: count }, () => Math.ceil(Math.random() * 6))
  );
  const [isRolling, setIsRolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync display when a board-side roll updates config.lastRoll
  useEffect(() => {
    if (config.lastRoll?.length === count) {
      setValues(config.lastRoll);
    }
  }, [config.lastRoll, count]);

  // Clean up any in-flight interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const roll = useCallback(() => {
    if (isRolling) return;
    setIsRolling(true);

    // Animate through random values for 500ms, then persist final result
    let frames = 0;
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setValues(
        Array.from({ length: count }, () => Math.ceil(Math.random() * 6))
      );
      frames++;
      if (frames >= 8) {
        const ref = intervalRef.current;
        if (ref !== null) clearInterval(ref);
        intervalRef.current = null;
        const finalValues = Array.from({ length: count }, () =>
          Math.ceil(Math.random() * 6)
        );
        setValues(finalValues);
        updateWidget(widget.id, {
          config: { ...config, lastRoll: finalValues },
        });
        setIsRolling(false);
      }
    }, 70);
  }, [config, count, isRolling, updateWidget, widget.id]);

  const changeCount = (delta: number) => {
    const newCount = Math.min(6, Math.max(1, count + delta));
    updateWidget(widget.id, { config: { ...config, count: newCount } });
    setValues(
      Array.from({ length: newCount }, () => Math.ceil(Math.random() * 6))
    );
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Dice
      </div>

      {/* Dice Display */}
      <div
        className="flex flex-wrap justify-center gap-3"
        style={{ maxWidth: 280 }}
      >
        {values.slice(0, count).map((v, i) => (
          <div
            key={i}
            className={`transition-transform ${isRolling ? 'animate-bounce' : ''}`}
          >
            <DieFace value={v} size={count <= 2 ? 100 : count <= 4 ? 80 : 64} />
          </div>
        ))}
      </div>

      {/* Roll Button */}
      <button
        onClick={roll}
        disabled={isRolling}
        className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-black text-lg shadow-lg transition-all active:scale-95"
        aria-label="Roll dice"
      >
        <Dices className="w-6 h-6" />
        {isRolling ? 'Rolling…' : 'Roll!'}
      </button>

      {/* Count control */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => changeCount(-1)}
          disabled={count <= 1}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-40 font-bold text-lg flex items-center justify-center transition-all active:scale-95"
          aria-label="Fewer dice"
        >
          −
        </button>
        <span className="text-white/80 font-bold text-sm w-16 text-center">
          {count} {count === 1 ? 'die' : 'dice'}
        </span>
        <button
          onClick={() => changeCount(1)}
          disabled={count >= 6}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-40 font-bold text-lg flex items-center justify-center transition-all active:scale-95"
          aria-label="More dice"
        >
          +
        </button>
      </div>
    </div>
  );
};
