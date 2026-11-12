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
