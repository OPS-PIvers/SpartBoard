import { describe, it, expect } from 'vitest';
import {
  formatGradeLevelsLabel,
  prepareLaunchConfig,
  QUICK_TOOLS,
} from './constants';

describe('formatGradeLevelsLabel', () => {
  it('orders a partial grade-band selection by canonical grade order, not string order', () => {
    // Selecting these three (in this click order) previously produced
    // "3-5, 6-8, 9-12" via a plain `.sort()` (digits < 'K' in ASCII) once a
    // 4th band like 'k-2' was mixed in — reproduced directly below.
    expect(formatGradeLevelsLabel(['9-12', 'k-2', '3-5'])).toBe(
      'K-2, 3-5, 9-12'
    );
  });

  it('sorts K-2 before numeric bands even though "K" > digits lexicographically', () => {
    expect(formatGradeLevelsLabel(['6-8', '3-5', 'k-2'])).toBe('K-2, 3-5, 6-8');
  });

  it('returns "None" for an empty selection', () => {
    expect(formatGradeLevelsLabel([])).toBe('None');
  });

  it('returns "Universal" when every grade band is selected', () => {
    expect(formatGradeLevelsLabel(['k-2', '3-5', '6-8', '9-12'])).toBe(
      'Universal'
    );
  });

  it('returns a single uppercased label for one selected band', () => {
    expect(formatGradeLevelsLabel(['3-5'])).toBe('3-5');
  });
});

describe('prepareLaunchConfig', () => {
  const quickTool = (label: string) =>
    QUICK_TOOLS.find((tool) => tool.label === label)?.config;

  it('starts a routine timer at its own duration, not the 10:00 default', () => {
    expect(
      prepareLaunchConfig('time-tool', quickTool('Timer (1 min)'), 1000)
    ).toMatchObject({
      mode: 'timer',
      duration: 60,
      elapsedTime: 60,
      isRunning: true,
      startTime: 1000,
    });
  });

  it('repairs a timer config saved before the fix', () => {
    expect(
      prepareLaunchConfig(
        'time-tool',
        { mode: 'timer', duration: 120, elapsedTime: 600, isRunning: true },
        1000
      )
    ).toMatchObject({ elapsedTime: 120, startTime: 1000 });
  });

  it('starts a routine stopwatch from zero with a start time', () => {
    expect(
      prepareLaunchConfig('time-tool', quickTool('Stopwatch'), 1000)
    ).toMatchObject({ elapsedTime: 0, isRunning: true, startTime: 1000 });
  });

  it('leaves other widgets and stopped timers alone', () => {
    const sound = quickTool('Noise Meter');
    expect(prepareLaunchConfig('sound', sound)).toBe(sound);
    const stopped = { mode: 'timer', duration: 60, isRunning: false };
    expect(prepareLaunchConfig('time-tool', stopped)).toBe(stopped);
  });
});
