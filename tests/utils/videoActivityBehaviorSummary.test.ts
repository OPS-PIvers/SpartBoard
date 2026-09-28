import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VA_BEHAVIOR,
  formatVideoActivityBehaviorSummary,
} from '@/utils/videoActivityBehavior';

describe('formatVideoActivityBehaviorSummary', () => {
  it('names no session mode, since every activity runs self-paced unless assigned live', () => {
    const summary = formatVideoActivityBehaviorSummary(DEFAULT_VA_BEHAVIOR);
    expect(summary).toBe('1 attempt · score only · shuffles answers');
    expect(summary).not.toMatch(/paced|progress/i);
  });
});
