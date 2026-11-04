import { describe, it, expect } from 'vitest';
import {
  ROLLOUT_ONLY_SWITCHES,
  countAccessMatches,
  matchesSearch,
  switchForFeature,
} from './accessSearch';
import { ROLLOUT_SWITCHES } from '@/config/rolloutSwitches';

describe('matchesSearch', () => {
  it('needs every word, in any field, ignoring case', () => {
    expect(matchesSearch('quiz ALOUD', ['Quiz read-aloud', 'id'])).toBe(true);
    expect(matchesSearch('quiz spotify', ['Quiz read-aloud'])).toBe(false);
    expect(matchesSearch('  ', ['anything'])).toBe(true);
  });
});

describe('countAccessMatches', () => {
  it('counts matches on each Access tab without mounting it', () => {
    const counts = countAccessMatches('paper answer');
    expect(counts.features).toBe(0);
    expect(counts.previews).toBeGreaterThan(0);
  });

  it('finds Record on the widget tab, not Global Settings', () => {
    const counts = countAccessMatches('record');
    expect(counts.widgets).toBeGreaterThan(0);
  });
});

describe('rollout switches on the Previews tab', () => {
  it('shows every switch, either on its flag row or under District switches', () => {
    for (const sw of ROLLOUT_SWITCHES) {
      const shown = sw.feature
        ? switchForFeature(sw.feature) === sw
        : ROLLOUT_ONLY_SWITCHES.includes(sw);
      expect(shown, sw.title).toBe(true);
    }
  });
});
