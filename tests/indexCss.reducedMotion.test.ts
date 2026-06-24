/**
 * Regression test for the `.animate-spin` / `prefers-reduced-motion` bug in
 * index.css.
 *
 * BUG: `index.css` contained a `@media (prefers-reduced-motion: reduce)` block
 * that suppressed `.animate-spin` with `animation: none !important`.  That
 * block appears AFTER the `@tailwind base` directive in source order, so it
 * overrides the intentional exclusion in tailwind.config.js's
 * `reducedMotionPlugin`.  The result: users with reduced-motion enabled see
 * loading spinners (Loader2 etc.) frozen at a static position, making async
 * operations appear stalled — directly contradicting WCAG 2.3.3 (essential
 * animations must be preserved).
 *
 * FIX: Remove `.animate-spin` from the index.css reduced-motion block so the
 * tailwind.config.js decision (which deliberately excludes it) is not
 * silently overridden by a later source-order rule.
 *
 * The tailwind.config.js `reducedMotionPlugin` comment explains the rationale:
 *   "Freezing a spinner reads as 'stalled' and removes the only in-progress
 *   affordance on async screens, so it keeps spinning even under
 *   reduced-motion (an essential animation under SC 2.3.3)."
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const CSS_PATH = resolve(__dirname, '../index.css');

/**
 * Extract the body of every `@media (prefers-reduced-motion: reduce)` block
 * from a CSS string.  Returns the concatenated inner text of all such blocks.
 */
function extractReducedMotionBlocks(css: string): string {
  const blocks: string[] = [];
  // Match @media (prefers-reduced-motion: reduce) { ... }
  // Uses a simple brace-depth counter so nested braces are handled correctly.
  const prefix = '@media (prefers-reduced-motion: reduce)';
  let searchFrom = 0;
  while (true) {
    const startIdx = css.indexOf(prefix, searchFrom);
    if (startIdx === -1) break;
    const braceStart = css.indexOf('{', startIdx);
    if (braceStart === -1) break;
    let depth = 1;
    let i = braceStart + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    blocks.push(css.slice(braceStart + 1, i - 1));
    searchFrom = i;
  }
  return blocks.join('\n');
}

describe('index.css — reduced-motion safety', () => {
  const css = readFileSync(CSS_PATH, 'utf-8');
  const reducedMotionCSS = extractReducedMotionBlocks(css);

  it('does NOT suppress .animate-spin inside prefers-reduced-motion blocks', () => {
    // .animate-spin must NOT appear as a selector in any reduced-motion block.
    // We check for the selector text rather than the full rule so the test
    // doesn't accidentally pass if `.animate-spin-slow` is present but
    // `.animate-spin` alone is absent (they share a common prefix).
    //
    // BEFORE FIX: index.css listed `.animate-spin` in the reduced-motion
    // block, overriding tailwind.config.js which deliberately excludes it.
    // AFTER FIX: `.animate-spin` is absent from all reduced-motion blocks.
    //
    // The regex matches `.animate-spin` as a discrete selector: preceded by
    // a rule boundary (comma, newline, or block open) and followed by a
    // comma, whitespace, or block-close — so `.animate-spin-slow` does not
    // trigger a false positive.
    const spinSelectorRegex = /(?:^|[,{\n\s])\.animate-spin(?:[,\s}]|$)/m;
    expect(reducedMotionCSS).not.toMatch(spinSelectorRegex);
  });

  it('DOES suppress .animate-spin-slow inside prefers-reduced-motion blocks', () => {
    // Sanity check: the decorative slow-spin IS correctly suppressed.
    expect(reducedMotionCSS).toContain('.animate-spin-slow');
  });

  it('DOES suppress .animate-dice-jitter inside prefers-reduced-motion blocks', () => {
    // Sanity check: the decorative dice-jitter IS correctly suppressed.
    expect(reducedMotionCSS).toContain('.animate-dice-jitter');
  });
});
