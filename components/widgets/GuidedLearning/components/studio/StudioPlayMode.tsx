import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import type { GuidedLearningSet } from '@/types';
import { GuidedLearningPlayer } from '../GuidedLearningPlayer';
import type { DevicePreset, StepEvent } from '../../types/stage';
import { DeviceFrame } from './DeviceFrame';

interface StudioPlayModeProps {
  set: GuidedLearningSet;
  preset: DevicePreset;
  startStepId: string | null;
  playerV2: boolean;
  onStepShown: (stepId: string) => void;
  onExit: () => void;
}

/** "Play from here": the real player in the same device frame as the canvas. */
export const StudioPlayMode: React.FC<StudioPlayModeProps> = ({
  set,
  preset,
  startStepId,
  playerV2,
  onStepShown,
  onExit,
}) => {
  const { t } = useTranslation();
  const onStepEvent = (e: StepEvent) => {
    if (e.type === 'enter') onStepShown(e.stepId);
  };
  return (
    <div
      className="relative flex h-full flex-col gap-3"
      data-testid="gl-studio-play"
    >
      <div className="flex shrink-0 justify-center">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-slate-700"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {t('glStudio.backToEditing')}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <DeviceFrame preset={preset}>
          <GuidedLearningPlayer
            set={set}
            teacherMode
            playerV2={playerV2}
            startStepId={startStepId ?? undefined}
            onStepEvent={onStepEvent}
          />
        </DeviceFrame>
      </div>
    </div>
  );
};
