import React from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { useStarterPacks } from '@/hooks/useStarterPacks';
import { WidgetComponentProps, StarterPack } from '@/types';
import * as LucideIcons from 'lucide-react';
import confetti from 'canvas-confetti';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { playCleanUpUnlocked } from './audioUtils';

export const StarterPackWidget = ({ isStudentView }: WidgetComponentProps) => {
  const { user } = useAuth();
  const { addWidget, deleteAllWidgets } = useDashboardActions();
  const { publicPacks, userPacks, loading, executePack } = useStarterPacks(
    user?.uid
  );

  // Combine packs for display
  const allPacks = [...publicPacks, ...userPacks];

  const handleExecute = async (pack: StarterPack) => {
    // Call the execution logic with cleanSlate=true
    executePack(pack, true, addWidget, deleteAllWidgets);

    // Audio and visual cues
    await playCleanUpUnlocked();
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
        <ScaledEmptyState
          icon={LucideIcons.Wand2}
          title="No starter packs available"
        />
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
