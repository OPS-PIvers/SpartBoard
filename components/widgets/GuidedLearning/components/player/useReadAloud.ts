import { useEffect, useEffectEvent, useState } from 'react';
import type { GuidedLearningPublicStep } from '@/types';
import { spokenStepText } from '../../utils/stepText';

export function speechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis as SpeechSynthesis | undefined) &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

/**
 * Reads the shown step aloud: its narration recording when it has one, else
 * speech synthesis. `stepKey` changes on every step visit; null = nothing shown.
 */
export function useReadAloud(opts: {
  enabled: boolean;
  step: GuidedLearningPublicStep | null;
  stepKey: string | null;
  onDone?: () => void;
}): { speaking: boolean } {
  const { enabled, step, stepKey } = opts;
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const finish = useEffectEvent((key: string) => {
    setDoneKey(key);
    opts.onDone?.();
  });

  // Speech and audio playback are external systems; the cleanup stops them on leave.
  useEffect(() => {
    if (!enabled || !step || !stepKey) return;
    const url = step.narration?.url;
    if (url) {
      const audio = new Audio(url);
      audio.onended = () => finish(stepKey);
      audio.onerror = () => finish(stepKey);
      void audio.play().catch(() => finish(stepKey));
      return () => {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      };
    }
    const text = spokenStepText(step);
    if (!text || !speechAvailable()) return;
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => finish(stepKey);
    utterance.onerror = () => finish(stepKey);
    synth.cancel();
    synth.speak(utterance);
    return () => {
      utterance.onend = null;
      utterance.onerror = null;
      synth.cancel();
    };
    // `step` is read when its key changes; a new visit gets a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stepKey]);

  const canSpeak =
    step !== null &&
    (Boolean(step.narration?.url) ||
      (speechAvailable() && spokenStepText(step) !== ''));
  return {
    speaking: enabled && canSpeak && stepKey !== null && doneKey !== stepKey,
  };
}
