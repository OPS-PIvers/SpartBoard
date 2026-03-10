import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Shuffle, RotateCcw } from 'lucide-react';
import { WidgetData, RandomConfig } from '@/types';

interface RemoteRandomControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const parseNames = (firstNames: string, lastNames: string): string[] => {
  const firsts = firstNames
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const lasts = lastNames
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (firsts.length === 0) return [];
  return firsts.map((f, i) => (lasts[i] ? `${f} ${lasts[i]}` : f));
};

export const RemoteRandomControl: React.FC<RemoteRandomControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as RandomConfig;
  const [isPicking, setIsPicking] = useState(false);
  // Local-only animated name shown during the picking animation.
  // We only call updateWidget once (with the final pick) to avoid spamming
  // Firestore and triggering re-renders on all connected clients.
  const [animatedName, setAnimatedName] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up any in-flight interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const names = parseNames(config.firstNames ?? '', config.lastNames ?? '');
  const remaining = config.remainingStudents ?? names;
  const picked = config.lastResult;

  const pickStudent = useCallback(() => {
    if (isPicking || names.length === 0) return;
    setIsPicking(true);

    let frames = 0;
    const pool = remaining.length > 0 ? remaining : names;

    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setAnimatedName(pool[Math.floor(Math.random() * pool.length)]);
      frames++;
      if (frames >= 10) {
        const ref = intervalRef.current;
        if (ref !== null) clearInterval(ref);
        intervalRef.current = null;
        const finalPick = pool[Math.floor(Math.random() * pool.length)];
        const newRemaining = pool.filter((n) => n !== finalPick);
        // Single write to shared state — the final result only
        updateWidget(widget.id, {
          config: {
            ...config,
            lastResult: finalPick,
            remainingStudents: newRemaining,
          },
        });
        setAnimatedName(null);
        setIsPicking(false);
      }
    }, 60);
  }, [config, isPicking, names, remaining, updateWidget, widget.id]);

  const resetPool = () => {
    updateWidget(widget.id, {
      config: { ...config, remainingStudents: names, lastResult: null },
    });
  };

  const firstPick =
    Array.isArray(picked) && picked.length > 0 ? picked[0] : null;
  const pickedName =
    typeof picked === 'string'
      ? picked
      : firstPick !== null
        ? typeof firstPick === 'string'
          ? firstPick
          : (firstPick.names[0] ?? null)
        : null;

  return (
    <div className="flex flex-col items-center gap-6 p-6 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Random Picker
      </div>

      {/* Result display — shows local animation frame during picking, final result otherwise */}
      <div className="w-full min-h-24 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 px-4 py-6">
        {(isPicking ? animatedName : pickedName) ? (
          <span className="text-white font-black text-3xl text-center">
            {isPicking ? animatedName : pickedName}
          </span>
        ) : (
          <span className="text-white/30 text-base italic">
            Tap Pick to select a student
          </span>
        )}
      </div>

      {/* Pool status */}
      <div className="text-white/50 text-sm">
        {remaining.length} / {names.length} remaining
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={resetPool}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/70 font-bold text-sm transition-all active:scale-95"
          aria-label="Reset pool"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={pickStudent}
          disabled={isPicking || names.length === 0}
          className="flex items-center gap-3 px-8 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white font-black text-lg shadow-lg transition-all active:scale-95"
          aria-label="Pick a student"
        >
          <Shuffle className="w-5 h-5" />
          {isPicking ? 'Picking…' : 'Pick!'}
        </button>
      </div>
    </div>
  );
};
