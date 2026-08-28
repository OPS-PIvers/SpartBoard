import { describe, it, expect, beforeEach } from 'vitest';
import { getAudioCtx as getSharedAudioCtx } from '@/utils/timeToolAudio';
import { getAudioCtx as getStarterPackAudioCtx } from '@/components/widgets/StarterPack/audioUtils';
import { getAudioCtx as getRandomAudioCtx } from '@/components/widgets/random/audioUtils';
import { getDiceAudioCtx } from '@/components/widgets/DiceWidget/utils/audio';

// Regression guard: each widget audio module used to build its own AudioContext instead of sharing one.
describe('widget audio context sharing', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    if (!(window as any).AudioContext) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (window as any).AudioContext = class MockAudioContext {
        state = 'suspended';
      };
    }
  });

  it('delegates every widget-local getAudioCtx helper to the same shared singleton', () => {
    const shared = getSharedAudioCtx();
    expect(shared).not.toBeNull();
    expect(getStarterPackAudioCtx()).toBe(shared);
    expect(getRandomAudioCtx()).toBe(shared);
    expect(getDiceAudioCtx()).toBe(shared);
  });
});
