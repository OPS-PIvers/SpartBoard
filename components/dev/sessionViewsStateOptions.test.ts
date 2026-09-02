import { describe, it, expect } from 'vitest';
import { STATES } from './sessionViewsStateOptions';

describe('session views dev harness state options', () => {
  it('gives every option a unique React key', () => {
    const ids = STATES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the option value as the bare state key', () => {
    for (const state of STATES) {
      expect(state.id.endsWith(`:${state.key}`)).toBe(true);
    }
  });

  it('still offers the state values shared by grading and playback', () => {
    for (const shared of ['archiving', 'deleted', 'provisional']) {
      expect(STATES.filter((s) => s.key === shared)).toHaveLength(2);
    }
  });
});
