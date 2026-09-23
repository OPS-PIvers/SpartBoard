import { useState } from 'react';
import { LEARNER_SPEEDS, type LearnerSpeed } from '../../utils/motion';

export const LEARNER_SPEED_KEY = 'spartboard.gl.learnerSpeed';

function isLearnerSpeed(n: number): n is LearnerSpeed {
  return (LEARNER_SPEEDS as readonly number[]).includes(n);
}

export function readLearnerSpeed(): LearnerSpeed {
  try {
    const raw = Number(window.localStorage.getItem(LEARNER_SPEED_KEY));
    return isLearnerSpeed(raw) ? raw : 1;
  } catch {
    return 1;
  }
}

/** Playback speed remembered per viewer on this device. */
export function useLearnerSpeed(): [LearnerSpeed, (s: LearnerSpeed) => void] {
  const [speed, setSpeedState] = useState<LearnerSpeed>(readLearnerSpeed);
  const setSpeed = (next: LearnerSpeed) => {
    setSpeedState(next);
    try {
      window.localStorage.setItem(LEARNER_SPEED_KEY, String(next));
    } catch {
      // Storage blocked (private window, policy): the choice lasts this visit.
    }
  };
  return [speed, setSpeed];
}
