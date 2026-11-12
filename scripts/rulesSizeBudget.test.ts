import { describe, expect, it } from 'vitest';
import { budgetVerdict, RULES_GROWTH_BUDGET } from './rulesSizeBudget.mjs';

describe('budgetVerdict', () => {
  it('passes growth up to the budget', () => {
    expect(
      budgetVerdict({
        compiled: 1000 + RULES_GROWTH_BUDGET,
        baseCompiled: 1000,
      })
    ).toEqual({
      ok: true,
      growth: RULES_GROWTH_BUDGET,
    });
  });

  it('passes a PR that shrinks the rules', () => {
    expect(budgetVerdict({ compiled: 900, baseCompiled: 1000 }).ok).toBe(true);
  });

  it('fails growth over the budget', () => {
    expect(
      budgetVerdict({
        compiled: 1000 + RULES_GROWTH_BUDGET + 1,
        baseCompiled: 1000,
      })
    ).toEqual({
      ok: false,
      growth: RULES_GROWTH_BUDGET + 1,
      overridden: false,
    });
  });

  it('lets the override label through', () => {
    expect(
      budgetVerdict({ compiled: 5000, baseCompiled: 1000, override: true })
    ).toEqual({
      ok: true,
      growth: 4000,
      overridden: true,
    });
  });
});
