// Per-PR growth budget for the compiled rules size (checkRulesSize.mjs runs it when RULES_BASE_REF is set).
import { execFileSync } from 'node:child_process';

export const RULES_GROWTH_BUDGET = 1500;
export const OVERRIDE_LABEL = 'rules-size-ok';

/** Pass/fail for one PR: growth over the base branch against the budget, unless the override label is on. */
export function budgetVerdict({ compiled, baseCompiled, budget = RULES_GROWTH_BUDGET, override = false }) {
  const growth = compiled - baseCompiled;
  if (growth <= budget) return { ok: true, growth };
  return { ok: override, growth, overridden: override };
}

/** Base firestore.rules: the PR merge commit's first parent in CI, else the tip of origin/<baseRef>. */
export function baseRulesText(baseRef) {
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  try {
    if (git('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ').length > 2) {
      return git('show', 'HEAD^1:firestore.rules');
    }
    execFileSync('git', ['fetch', '--quiet', '--depth=1', 'origin', baseRef], { stdio: 'ignore' });
    return git('show', 'FETCH_HEAD:firestore.rules');
  } catch {
    return null;
  }
}

// Compile work: Google's rules compiler re-expands every helper at each call site and gives up after ~5.2 s.
// Units = expanded nodes + 3 per expanded helper call (fit to local compile times; Google takes ~2x local).
export const COMPILE_COST_GROWTH_BUDGET = 2000;
// Ratchet: lower this as each compile-time slice lands. ~247,000 is where Google times out on a typical day.
export const COMPILE_COST_CEILING = 225000;
export const COMPILE_COST_TARGET = 155000;
export const COST_OVERRIDE_LABEL = 'rules-compile-ok';

export function compileUnits({ nodes, calls }) {
  return nodes + 3 * calls;
}

/** Rough Google compile time in seconds on a typical day; load swings it by about half either way. */
export function estimatedGoogleSeconds(units) {
  return Math.round((0.66 + units * 18.4e-6) * 10) / 10;
}
