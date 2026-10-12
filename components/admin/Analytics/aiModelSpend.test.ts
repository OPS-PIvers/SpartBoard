import { describe, expect, it } from 'vitest';
import { fillSpendDays, formatUsd, summarizeModelSpend } from './aiModelSpend';

describe('summarizeModelSpend', () => {
  it('groups by model and prices tokens at list price', () => {
    const s = summarizeModelSpend([
      {
        date: '2026-10-12',
        integration: 'quiz',
        model: 'claude-sonnet-5-5',
        calls: 2,
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        fallbacks: 0,
        errors: 1,
      },
      {
        date: '2026-10-12',
        integration: 'poll',
        model: 'claude-sonnet-5-5',
        calls: 1,
        inputTokens: 0,
        outputTokens: 0,
      },
      {
        date: '2026-10-13',
        integration: 'quiz',
        model: 'gemini-2.5-flash-lite',
        calls: 4,
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        fallbacks: 1,
      },
    ]);
    expect(s.totalCalls).toBe(7);
    expect(s.models[0]).toMatchObject({
      model: 'claude-sonnet-5-5',
      provider: 'claude',
      calls: 3,
      errors: 1,
    });
    // $2/M input + $10/M output
    expect(s.models[0].cost).toBeCloseTo(3);
    // $0.10/M input + $0.40/M output
    expect(s.models[1]).toMatchObject({ provider: 'gemini', fallbacks: 1 });
    expect(s.models[1].cost).toBeCloseTo(0.5);
    expect(s.costByProvider.claude).toBeCloseTo(3);
    expect(s.costByProvider.gemini).toBeCloseTo(0.5);
    expect(s.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13']);
  });

  it('applies a scheduled price change by the row date', () => {
    const row = (date: string) => ({
      date,
      model: 'gemini-3.8-flash',
      calls: 1,
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(summarizeModelSpend([row('2026-12-31')]).totalCost).toBeCloseTo(
      0.75
    );
    expect(summarizeModelSpend([row('2027-01-01')]).totalCost).toBeCloseTo(1.5);
  });

  it('counts calls but no cost for an unpriced model and skips malformed rows', () => {
    const s = summarizeModelSpend([
      { date: '2026-10-12', model: 'gemini-9-ultra', calls: 2 },
      { date: '2026-10-12', calls: 5 },
    ]);
    expect(s.totalCalls).toBe(2);
    expect(s.totalCost).toBe(0);
  });
});

describe('fillSpendDays', () => {
  it('fills missing dates with zero spend', () => {
    const days = fillSpendDays(
      [{ date: '2026-10-12', byModel: { x: 1 }, total: 1 }],
      '2026-10-11',
      '2026-10-13'
    );
    expect(days.map((d) => [d.date, d.total])).toEqual([
      ['2026-10-11', 0],
      ['2026-10-12', 1],
      ['2026-10-13', 0],
    ]);
  });
});

describe('formatUsd', () => {
  it('shows tiny spend as under a cent', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(12.5)).toBe('$12.50');
  });
});
