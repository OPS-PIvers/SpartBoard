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
    <div className="p-4 h-full flex-1 overflow-y-auto min-h-0">
      {loading ? (
        <div className="flex items-center justify-center h-full text-slate-500">
          Loading packs...
        </div>
      ) : allPacks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center gap-2">
          <LucideIcons.Wand2 className="w-8 h-8 opacity-50" />
          <p>No starter packs available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {allPacks.map((pack) => {
            const iconName = pack.icon as keyof typeof LucideIcons;
            const IconComponent =
              (LucideIcons[iconName] as React.ComponentType<{
                className?: string;
              }>) ?? LucideIcons.Wand2;

            return (
              <button
                key={pack.id}
                onClick={() => handleExecute(pack)}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all hover:-translate-y-1 hover:shadow-md
                  bg-white border-slate-200 hover:border-${pack.color}-500 group`}
              >
                <div
                  className={`p-3 rounded-xl bg-${pack.color}-100 text-${pack.color}-600 group-hover:scale-110 transition-transform`}
                >
                  <IconComponent className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1">
                    {pack.name}
                  </h3>
                  {pack.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">
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
