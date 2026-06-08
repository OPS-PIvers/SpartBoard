import { describe, it, expect } from 'vitest';
import tailwindConfig from '../../tailwind.config.js';

/**
 * Guards the global `prefers-reduced-motion: reduce` handling (WCAG 2.3.3).
 *
 * A Tailwind base-layer plugin in `tailwind.config.js` injects a media rule
 * that disables non-essential decorative/looping animations for motion-
 * sensitive users. These tests exercise that plugin's `addBase` handler and
 * assert the emitted rule:
 *   - targets every decorative animation utility (built-in + custom keyframe), and
 *   - leaves functional transitions / one-shot entrance animations untouched.
 */

type AddBaseStyles = Record<string, Record<string, Record<string, string>>>;

const REDUCE_MEDIA = '@media (prefers-reduced-motion: reduce)';

/**
 * Find the base styles registered by our reduced-motion plugin.
 *
 * Each plugin exposes its registration fn as `.handler`. We run them with a
 * minimal stub that only supplies `addBase`; other plugins (e.g.
 * tailwindcss-animate) need a richer API and throw, so we skip those and keep
 * the one that registers the `prefers-reduced-motion` rule.
 */
function collectReducedMotionStyles(): AddBaseStyles {
  for (const p of tailwindConfig.plugins ?? []) {
    const handler = (
      p as { handler?: (api: { addBase: (s: AddBaseStyles) => void }) => void }
    ).handler;
    if (typeof handler !== 'function') continue;
    const captured: AddBaseStyles = {};
    try {
      handler({
        addBase: (styles) => {
          Object.assign(captured, styles);
        },
      });
    } catch {
      // Plugin needs more of the Tailwind plugin API than we stub — not ours.
      continue;
    }
    if (captured[REDUCE_MEDIA]) return captured;
  }
  return {};
}

describe('global prefers-reduced-motion handling', () => {
  it('registers a prefers-reduced-motion: reduce base rule', () => {
    const styles = collectReducedMotionStyles();
    expect(styles[REDUCE_MEDIA]).toBeDefined();
  });

  it('disables decorative / looping animations', () => {
    const styles = collectReducedMotionStyles();
    const selector = Object.keys(styles[REDUCE_MEDIA])[0];
    const decl = styles[REDUCE_MEDIA][selector];

    // Every decorative animation utility must be neutralized.
    for (const cls of [
      'animate-spin-slow',
      'animate-pulse',
      'animate-ping',
      'animate-bounce',
      'animate-jiggle',
      'animate-shimmer',
      'animate-marquee',
      'animate-gl-pulse-reminder',
    ]) {
      expect(selector).toContain(`.${cls}`);
    }
    expect(decl.animation).toBe('none !important');
  });

  it('preserves urgency signals and functional/entrance animations', () => {
    const styles = collectReducedMotionStyles();
    const selector = Object.keys(styles[REDUCE_MEDIA])[0];

    // One-shot entrance animations (tailwindcss-animate) orient rather than
    // distract — they must keep running. The timer "time's up" urgency cue is
    // conveyed via color, not a class on this list, so nothing here disables it.
    expect(selector).not.toContain('.animate-in');
    expect(selector).not.toContain('.animate-fade-in');

    // Loading spinners (.animate-spin, e.g. Loader2) are an essential
    // in-progress affordance, so they keep spinning under reduced-motion. Match
    // exact classes — `.animate-spin-slow` contains `.animate-spin` as a
    // substring, so a naive `toContain` check would be misleading.
    const selectorClasses = selector.split(',').map((s) => s.trim());
    expect(selectorClasses).not.toContain('.animate-spin');
    expect(selectorClasses).toContain('.animate-spin-slow');
  });

  it('covers every looping keyframe animation defined in the theme', () => {
    // Each infinite/looping animation in the theme is decorative and should be
    // listed; this guards against a future keyframe being added without a
    // matching reduced-motion opt-out.
    const animations = tailwindConfig.theme?.extend?.animation ?? {};
    const looping = Object.entries(animations)
      .filter(
        ([, value]) => typeof value === 'string' && value.includes('infinite')
      )
      .map(([name]) => `animate-${name}`);

    const styles = collectReducedMotionStyles();
    const selector = Object.keys(styles[REDUCE_MEDIA])[0];
    for (const cls of looping) {
      expect(selector).toContain(`.${cls}`);
    }
  });
});
