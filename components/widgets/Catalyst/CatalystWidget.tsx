import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData } from '@/types';
import { useCatalystRoutines } from '@/hooks/useCatalystRoutines';
import { isSafeIconUrl } from './catalystHelpers';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Zap, ImageOff } from 'lucide-react';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import {
  playCleanUp,
  getAudioCtx,
} from '@/components/widgets/StarterPack/audioUtils';
import confetti from 'canvas-confetti';
import { CatalystSettings } from './CatalystSettings';

export const CatalystWidget: React.FC<{ widget: WidgetData }> = () => {
  const { addWidget, deleteAllWidgets } = useDashboard();
  const { routines, loading, executeRoutine } = useCatalystRoutines();

  const handleExecute = (routineId: string) => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) return;

    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }

    executeRoutine(routine, true, addWidget, deleteAllWidgets);

    playCleanUp();
    void confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  if (loading) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="flex items-center justify-center h-full text-slate-400">
            <span style={{ fontSize: 'min(14px, 5cqmin)' }}>Loading…</span>
          </div>
        }
      />
    );
  }

  if (routines.length === 0) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Zap}
            title="No Routines"
            subtitle="Admins can add routines via the Catalyst settings (gear icon)."
          />
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="grid grid-cols-2 h-full w-full"
          style={{ gap: 'min(12px, 2.5cqmin)', padding: 'min(12px, 2.5cqmin)' }}
        >
          {routines.map((routine) => (
            <button
              key={routine.id}
              onClick={() => handleExecute(routine.id)}
              className="relative rounded-2xl overflow-hidden flex flex-col items-stretch text-left shadow-md hover:scale-[1.03] hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 bg-slate-200"
              style={{ minHeight: 'min(100px, 25cqmin)' }}
            >
              {routine.imageUrl && isSafeIconUrl(routine.imageUrl) ? (
                <>
                  <img
                    src={routine.imageUrl}
                    alt={routine.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-300 border-2 border-dashed border-slate-400">
                  <div
                    className="flex flex-col items-center text-slate-500"
                    style={{ gap: 'min(4px, 1cqmin)' }}
                  >
                    <ImageOff
                      style={{
                        width: 'min(24px, 8cqmin)',
                        height: 'min(24px, 8cqmin)',
                      }}
                    />
                    <span
                      className="font-bold uppercase tracking-widest text-slate-500"
                      style={{ fontSize: 'min(9px, 3cqmin)' }}
                    >
                      IMAGE PLACEHOLDER
                    </span>
                  </div>
                </div>
              )}

              {/* Title footer */}
              <div
                className="relative mt-auto z-10 bg-black/50"
                style={{ padding: 'min(6px, 1.8cqmin) min(10px, 2.5cqmin)' }}
              >
                <span
                  className="font-black uppercase tracking-widest text-white drop-shadow block text-center leading-tight"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  {routine.title}
                </span>
              </div>
            </button>
          ))}
        </div>
      }
    />
  );
};

// Re-export CatalystSettings so WidgetRegistry can load it via lazyNamed
export { CatalystSettings };
