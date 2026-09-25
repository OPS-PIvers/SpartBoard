import { describe, it, expect } from 'vitest';
import { countAccessMatches, matchesSearch } from './accessSearch';

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
    expect(counts.global).toBe(0);
    expect(counts.previews).toBeGreaterThan(0);
  });

  it('finds Record on the widget tab, not Global Settings', () => {
    const counts = countAccessMatches('record');
    expect(counts.features).toBeGreaterThan(0);
  });
});
