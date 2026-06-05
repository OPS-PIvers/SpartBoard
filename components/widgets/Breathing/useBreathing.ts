import { useState, useEffect, useCallback, useRef } from 'react';

import type { BreathingConfig } from '@/types';

type BreathingPattern = BreathingConfig['pattern'];

interface PatternData {
  inhale: number;
  hold1: number;
  exhale: number;
  hold2: number;
}

const PATTERNS: Record<BreathingPattern, PatternData> = {
  '4-4-4-4': { inhale: 4, hold1: 4, exhale: 4, hold2: 4 }, // Box breathing
  '4-7-8': { inhale: 4, hold1: 7, exhale: 8, hold2: 0 }, // Relaxing breath
  '5-5': { inhale: 5, hold1: 0, exhale: 5, hold2: 0 }, // Coherent breathing
};

export type BreathingPhase = 'ready' | 'inhale' | 'hold1' | 'exhale' | 'hold2';

export const useBreathing = (patternId: BreathingPattern) => {
  const pattern = PATTERNS[patternId];

  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<BreathingPhase>('ready');
  const [timeLeft, setTimeLeft] = useState(0);
  const [progress, setProgress] = useState(0); // 0 to 1 for the current phase

  // Refs to avoid dependency cycles in requestAnimationFrame
  const stateRef = useRef({
    isActive,
    phase,
    timeLeft,
    progress,
    startTime: 0,
    phaseDuration: 0,
  });

  // Keep refs in sync with state
  useEffect(() => {
    stateRef.current.isActive = isActive;
    stateRef.current.phase = phase;
    stateRef.current.timeLeft = timeLeft;
    stateRef.current.progress = progress;
  }, [isActive, phase, timeLeft, progress]);

  const reset = useCallback(() => {
    setIsActive(false);
    setPhase('ready');
    setTimeLeft(0);
    setProgress(0);
  }, []);

  // Update phase durations when pattern changes.
  // When the timer is active mid-cycle, also update stateRef.phaseDuration and
  // stateRef.startTime so the CURRENT phase runs for the new pattern's duration
  // rather than the stale old value.  The startTime is recalculated to preserve
  // the fraction of the phase already elapsed (progress), so the animation
  // continues smoothly from the same visual position.
  const patternRef = useRef(pattern);
  useEffect(() => {
    const newPattern = PATTERNS[patternId];
    patternRef.current = newPattern;

    // Only rebase timing when the timer is actively running and we are in a
    // real phase (not 'ready').  If we are paused, stateRef.phaseDuration will
    // be re-derived from the saved progress when toggleActive() resumes, so no
    // update is needed here.
    if (stateRef.current.isActive) {
      const currentPhase = stateRef.current.phase;
      if (currentPhase !== 'ready') {
        const newDurationSeconds =
          newPattern[currentPhase as keyof PatternData];
        if (newDurationSeconds > 0) {
          const newPhaseDuration = newDurationSeconds * 1000;
          const now = performance.now();
          // Preserve the fraction of the phase already elapsed so the visual
          // circle does not jump.
          const elapsedAlready = stateRef.current.progress * newPhaseDuration;
          stateRef.current.phaseDuration = newPhaseDuration;
          stateRef.current.startTime = now - elapsedAlready;
        } else {
          // New pattern does not have this phase (duration === 0, e.g. hold1/hold2
          // when switching to a two-phase pattern).  Set phaseDuration to 0 so the
          // next RAF tick sees elapsed (≥ 0) >= phaseDuration (0) and transitions
          // immediately, rather than waiting out the stale old duration.
          stateRef.current.phaseDuration = 0;
          stateRef.current.startTime = performance.now();
        }
      }
    }
  }, [patternId]);

  const toggleActive = useCallback(() => {
    setIsActive((prev) => {
      if (!prev) {
        const now = performance.now();
        const currentPhase = stateRef.current.phase;

        if (currentPhase === 'ready') {
          // Fresh start from idle state
          const newPhase = 'inhale';
          setPhase(newPhase);
          const duration = patternRef.current[newPhase];
          setTimeLeft(duration);
          setProgress(0);
          stateRef.current.startTime = now;
          stateRef.current.phaseDuration = duration * 1000;
        } else {
          // Resuming from a paused mid-phase position. Reconstruct startTime
          // so that elapsed = progress * phaseDuration, preserving the
          // exact position in the current phase rather than jumping back to
          // the beginning of inhale.
          const { phaseDuration, progress } = stateRef.current;
          const elapsedAlready = progress * phaseDuration;
          stateRef.current.startTime = now - elapsedAlready;
        }
        return true;
      } else {
        // Pausing — RAF loop will be cancelled by the isActive effect cleanup.
        return false;
      }
    });
  }, []);

  useEffect(() => {
    if (!isActive) return;

    let animationFrameId: number;

    const tick = (now: number) => {
      const { phase, startTime, phaseDuration } = stateRef.current;
      const p = patternRef.current;

      const elapsed = now - startTime;

      if (elapsed >= phaseDuration) {
        // Switch to next phase
        let nextPhase: BreathingPhase = 'ready';
        let nextDuration = 0;

        switch (phase) {
          case 'inhale':
            nextPhase = p.hold1 > 0 ? 'hold1' : 'exhale';
            break;
          case 'hold1':
            nextPhase = 'exhale';
            break;
          case 'exhale':
            nextPhase = p.hold2 > 0 ? 'hold2' : 'inhale';
            break;
          case 'hold2':
            nextPhase = 'inhale';
            break;
          default:
            nextPhase = 'ready';
        }

        nextDuration =
          nextPhase !== 'ready' ? p[nextPhase as keyof PatternData] : 0;

        setPhase(nextPhase);
        setTimeLeft(nextDuration);
        setProgress(0);

        stateRef.current.startTime = now;
        stateRef.current.phaseDuration = nextDuration * 1000;
      } else {
        // Update current phase progress
        const currentProgress = elapsed / phaseDuration;
        const currentSecondsLeft = Math.ceil((phaseDuration - elapsed) / 1000);

        setProgress(currentProgress);
        setTimeLeft(currentSecondsLeft);
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isActive]);

  return {
    isActive,
    phase,
    timeLeft,
    progress,
    toggleActive,
    reset,
  };
};
