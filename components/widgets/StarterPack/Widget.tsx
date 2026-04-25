import React from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useStarterPacks } from '@/hooks/useStarterPacks';
import { WidgetComponentProps, StarterPack } from '@/types';
import * as LucideIcons from 'lucide-react';
import confetti from 'canvas-confetti';
import { playCleanUp, getAudioCtx } from './audioUtils';

export const StarterPackWidget = ({ isStudentView }: WidgetComponentProps) => {
  const { user } = useAuth();
  const { addWidget, deleteAllWidgets } = useDashboard();
  const { publicPacks, userPacks, loading, executePack } = useStarterPacks(
    user?.uid
  );

  // Combine packs for display
  const allPacks = [...publicPacks, ...userPacks];

  const handleExecute = (pack: StarterPack) => {
    // Unlock audio context if needed
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }

    // Call the execution logic with cleanSlate=true
    executePack(pack, true, addWidget, deleteAllWidgets);

    // Audio and visual cues
    playCleanUp();
    void confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  if (isStudentView) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Not available in student view
      </div>
    );
  }

  return (
    <div
      className="h-full flex-1 overflow-y-auto min-h-0"
      style={{ padding: 'min(16px, 3.5cqmin)' }}
    >
      {loading ? (
        <div className="flex items-center justify-center h-full text-slate-500">
          Loading packs...
        </div>
      ) : allPacks.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-full text-slate-400 text-center"
          style={{ gap: 'min(8px, 2cqmin)' }}
        >
          <LucideIcons.Wand2
            className="opacity-50"
            style={{
              width: 'min(32px, 8cqmin)',
              height: 'min(32px, 8cqmin)',
            }}
          />
          <p>No starter packs available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2" style={{ gap: 'min(16px, 3cqmin)' }}>
          {allPacks.map((pack) => {
            const IconComponent =
              (
                LucideIcons as unknown as Record<
                  string,
                  React.ComponentType<{
                    className?: string;
                    style?: React.CSSProperties;
                  }>
                >
              )[pack.icon] ?? LucideIcons.Wand2;

            return (
              <button
                key={pack.id}
                onClick={() => handleExecute(pack)}
                className="flex flex-col items-center rounded-xl border-2 transition-all hover:-translate-y-1 hover:shadow-md bg-white border-slate-200 group"
                style={
                  {
                    '--hover-border-color': `var(--color-${pack.color}-500, currentColor)`,
                    gap: 'min(12px, 2.5cqmin)',
                    padding: 'min(16px, 3.5cqmin)',
                  } as React.CSSProperties
                }
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `var(--color-${pack.color}-500, #3b82f6)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '';
                }}
              >
                <div
                  className="rounded-xl group-hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: `var(--color-${pack.color}-100, #dbeafe)`,
                    color: `var(--color-${pack.color}-600, #2563eb)`,
                    padding: 'min(12px, 2.5cqmin)',
                  }}
                >
                  <IconComponent
                    style={{
                      width: 'min(32px, 8cqmin)',
                      height: 'min(32px, 8cqmin)',
                    }}
                  />
                </div>
                <div className="text-center">
                  <h3
                    className="font-bold text-slate-800 leading-tight"
                    style={{
                      fontSize: 'min(14px, 5.5cqmin)',
                      marginBottom: 'min(4px, 1cqmin)',
                    }}
                  >
                    {pack.name}
                  </h3>
                  {pack.description && (
                    <p
                      className="text-slate-500 line-clamp-2"
                      style={{ fontSize: 'min(11px, 4cqmin)' }}
                    >
                      {pack.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StarterPackWidget;
