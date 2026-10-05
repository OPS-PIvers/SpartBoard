import { defineFixtures } from './types';
import { STRESS } from './stress';

export const timeToolFixtures = defineFixtures<'time-tool'>({
  empty: { config: {} },
  typical: {
    config: {
      mode: 'timer',
      visualType: 'visual',
      duration: 300,
      elapsedTime: 180,
      isRunning: false,
      timerEndVoiceLevel: 1,
      timerEndTrafficColor: 'green',
    },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      mode: 'stopwatch',
      visualType: 'digital',
      duration: 5999,
      elapsedTime: 5999,
      isRunning: false,
      clockStyle: 'lcd',
      glow: true,
      adjustStepSeconds: 600,
      timerEndTriggerRandom: true,
      timerEndTriggerNextUp: true,
      timerEndTriggerStationsRotate: true,
    },
  },
});
