import { describe, expect, it } from 'vitest';
import { summarizeCallLog } from './useAiUsageLog';

describe('summarizeCallLog', () => {
  it('sums days and models per integration and skips malformed rows', () => {
    const out = summarizeCallLog([
      {
        integration: 'quiz',
        model: 'gemini-3.5-flash-lite',
        calls: 3,
        inputTokens: 30,
        outputTokens: 9,
      },
      {
        integration: 'quiz',
        model: 'claude-sonnet-5-5',
        calls: 2,
        inputTokens: 20,
        outputTokens: 4,
        fallbacks: 1,
      },
      { integration: 'quiz', calls: 99 },
    ]);
    expect(out.quiz).toMatchObject({
      calls: 5,
      inputTokens: 50,
      outputTokens: 13,
      fallbacks: 1,
      byModel: { 'gemini-3.5-flash-lite': 3, 'claude-sonnet-5-5': 2 },
    });
  });
});
