import { describe, expect, it } from 'vitest';
import {
  budgetVerdict,
  compileUnits,
  COMPILE_COST_CEILING,
  COMPILE_COST_GROWTH_BUDGET,
  COMPILE_COST_TARGET,
  estimatedGoogleSeconds,
  RULES_GROWTH_BUDGET,
} from './rulesSizeBudget.mjs';

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

describe('compile work', () => {
  it('weighs each expanded helper call as three nodes', () => {
    expect(compileUnits({ nodes: 1000, calls: 100 })).toBe(1300);
  });

  it('keeps the target well under the ~5.2 s Google timeout', () => {
    expect(COMPILE_COST_TARGET).toBeLessThan(COMPILE_COST_CEILING);
    expect(estimatedGoogleSeconds(COMPILE_COST_TARGET)).toBeLessThan(3.8);
  });

  it('budgets compile growth with the same verdict as bytes', () => {
    expect(
      budgetVerdict({
        compiled: 1000 + COMPILE_COST_GROWTH_BUDGET + 1,
        baseCompiled: 1000,
        budget: COMPILE_COST_GROWTH_BUDGET,
      }).ok
    ).toBe(false);
  });
});
