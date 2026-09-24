import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Pencil } from 'lucide-react';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  dedupeStepsById,
  toPublicStep,
} from '@/hooks/useGuidedLearningSession';
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

/** "Play from here": the real player, as students get it, in the canvas's device frame. */
export const StudioPlayMode: React.FC<StudioPlayModeProps> = ({
  set,
  preset,
  startStepId,
  playerV2,
  onStepShown,
  onExit,
}) => {
  const { t } = useTranslation();
  const [showKey, setShowKey] = useState(false);
  const [resumeStepId, setResumeStepId] = useState(startStepId);
  const currentStepRef = useRef<string | null>(startStepId);
  // Steps go through the same mirror an assignment uses, so preview can't show what students won't get.
  const studentSet = useMemo(
    () => ({
      ...set,
      steps: dedupeStepsById(set.steps).map(
        toPublicStep
      ) as unknown as GuidedLearningStep[],
    }),
    [set]
  );
  const onStepEvent = (e: StepEvent) => {
    if (e.type !== 'enter') return;
    currentStepRef.current = e.stepId;
    onStepShown(e.stepId);
  };
  return (
    <div
      className="relative flex h-full flex-col gap-3"
      data-testid="gl-studio-play"
    >
      <div className="flex shrink-0 items-center justify-center gap-2">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-slate-700"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {t('glStudio.backToEditing')}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={showKey}
          onClick={() => {
            setResumeStepId(currentStepRef.current);
            setShowKey((v) => !v);
          }}
          className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-bold text-slate-700 shadow-lg transition-colors hover:bg-slate-100"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {t('glStudio.showAnswerKey')}
          <span
            aria-hidden="true"
            className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
              showKey ? 'bg-amber-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                showKey ? 'left-3.5' : 'left-0.5'
              }`}
            />
          </span>
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <DeviceFrame preset={preset}>
          <GuidedLearningPlayer
            // Remount on toggle, resuming at the step on screen.
            key={showKey ? 'key' : 'student'}
            set={showKey ? set : studentSet}
            teacherMode={showKey}
            playerV2={playerV2}
            startStepId={resumeStepId ?? undefined}
            onStepEvent={onStepEvent}
          />
        </DeviceFrame>
      </div>
    </div>
  );
};
