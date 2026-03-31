import React, { useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { CatalystConfig, WidgetData } from '@/types';
import { useCatalystSets } from '@/hooks/useCatalystSets';
import { isSafeIconUrl, renderCatalystIcon } from './catalystHelpers';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Zap, ImageOff, ChevronLeft } from 'lucide-react';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import {
  playCleanUp,
  getAudioCtx,
} from '@/components/widgets/StarterPack/audioUtils';
import confetti from 'canvas-confetti';
import { CatalystSettings } from './CatalystSettings';

export const CatalystWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { addWidget } = useDashboard();
  const { sets, loading, executeRoutine } = useCatalystSets();
  const [activeSetId, setActiveSetId] = useState<string | null>(
    (widget.config as CatalystConfig | undefined)?.initialSetId ?? null
  );

  const activeSet = sets.find((s) => s.id === activeSetId);

  const handleExecute = (routineId: string) => {
    if (!activeSet) return;
    const routine = activeSet.routines.find((r) => r.id === routineId);
    if (!routine) return;

    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }

    executeRoutine(routine, addWidget);

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

  if (sets.length === 0) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Zap}
            title="No Sets"
            subtitle="Admins can add sets via the Catalyst settings (gear icon)."
          />
        }
      />
    );
  }

  // Active Set View (Routines)
  if (activeSet) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="flex flex-col h-full w-full">
            {/* Header */}
            <div
              className="flex items-center bg-slate-100 border-b border-slate-200 shrink-0"
              style={{ padding: 'min(8px, 1.5cqmin) min(12px, 2.5cqmin)' }}
            >
              <button
                onClick={() => setActiveSetId(null)}
                className="rounded-full hover:bg-slate-200 transition-colors text-slate-600 mr-2"
                style={{ padding: 'min(4px, 1cqmin)' }}
              >
                <ChevronLeft
                  style={{
                    width: 'min(20px, 5cqmin)',
                    height: 'min(20px, 5cqmin)',
                  }}
                />
              </button>
              <span
                className="font-bold text-slate-800 truncate"
                style={{ fontSize: 'min(14px, 4cqmin)' }}
              >
                {activeSet.title}
              </span>
            </div>

            {/* Routines Grid */}
            <div
              className="grid grid-cols-2 flex-1 overflow-y-auto custom-scrollbar"
              style={{
                gap: 'min(12px, 2.5cqmin)',
                padding: 'min(12px, 2.5cqmin)',
                alignContent: 'start',
              }}
            >
              {activeSet.routines.map((routine) => (
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
                      </div>
                    </div>
                  )}

                  {routine.icon && (
                    <div
                      className="absolute top-2 left-2 z-10 rounded-full flex items-center justify-center shadow-sm"
                      style={{
                        width: 'min(24px, 8cqmin)',
                        height: 'min(24px, 8cqmin)',
                        backgroundColor:
                          routine.buttonColor?.trim() ??
                          'rgba(255,255,255,0.9)',
                        color: routine.iconColor?.trim() ?? '#4338ca',
                      }}
                    >
                      {renderCatalystIcon(
                        routine.icon,
                        'min(16px, 5cqmin)',
                        ''
                      )}
                    </div>
                  )}

                  {/* Title footer */}
                  <div
                    className="relative mt-auto z-10 bg-black/50 flex flex-col"
                    style={{
                      padding: 'min(6px, 1.8cqmin) min(10px, 2.5cqmin)',
                    }}
                  >
                    <span
                      className="font-black uppercase tracking-widest text-white drop-shadow block text-center leading-tight truncate"
                      style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                    >
                      {routine.title}
                    </span>
                    {routine.description && (
                      <span
                        className="text-white/80 block text-center truncate mt-0.5"
                        style={{ fontSize: 'min(9px, 2.5cqmin)' }}
                      >
                        {routine.description}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {activeSet.routines.length === 0 && (
                <div className="col-span-2 flex flex-col items-center justify-center text-slate-400 h-full min-h-[50cqmin]">
                  <span style={{ fontSize: 'min(12px, 3.5cqmin)' }}>
                    No routines in this set.
                  </span>
                </div>
              )}
            </div>
          </div>
        }
      />
    );
  }

  // Sets View
  return (
    <WidgetLayout
      padding="p-0"
      content={
        <>
          <style>{`
            .catalyst-sets-grid {
              display: grid;
              gap: min(12px, 2.5cqmin);
              padding: min(12px, 2.5cqmin);
              height: 100%;
              width: 100%;
            }
            @container (aspect-ratio >= 1.5) {
              .catalyst-sets-grid { grid-template-columns: repeat(4, 1fr); grid-template-rows: 1fr; }
            }
            @container (aspect-ratio <= 0.7) {
              .catalyst-sets-grid { grid-template-columns: 1fr; grid-template-rows: repeat(4, 1fr); }
            }
            @container (aspect-ratio > 0.7) and (aspect-ratio < 1.5) {
              .catalyst-sets-grid { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
            }
          `}</style>
          <div className="catalyst-sets-grid">
            {sets.map((set) => (
              <button
                key={set.id}
                onClick={() => setActiveSetId(set.id)}
                disabled={!set.title && set.routines.length === 0}
                className="relative rounded-2xl overflow-hidden flex flex-col items-stretch text-left shadow-md hover:scale-[1.03] hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 bg-slate-200 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                {set.imageUrl && isSafeIconUrl(set.imageUrl) ? (
                  <>
                    <img
                      src={set.imageUrl}
                      alt={set.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
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
                    </div>
                  </div>
                )}

                {/* Title footer */}
                <div
                  className="relative mt-auto z-10 flex flex-col"
                  style={{
                    padding: 'min(8px, 2.5cqmin) min(10px, 3cqmin)',
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.4))',
                  }}
                >
                  <span
                    className="font-black uppercase tracking-widest text-white drop-shadow truncate block leading-tight"
                    style={{ fontSize: 'min(14px, 5cqmin)' }}
                  >
                    {set.title || 'Empty Set'}
                  </span>
                  {set.description && (
                    <span
                      className="text-white/80 truncate block mt-0.5"
                      style={{ fontSize: 'min(10px, 3cqmin)' }}
                    >
                      {set.description}
                    </span>
                  )}
                  <span
                    className="text-indigo-200 font-bold mt-1"
                    style={{ fontSize: 'min(10px, 3cqmin)' }}
                  >
                    {set.routines.length} ROUTINE
                    {set.routines.length !== 1 ? 'S' : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      }
    />
  );
};

// Re-export CatalystSettings so WidgetRegistry can load it via lazyNamed
export { CatalystSettings };
