import type { PluginCreator } from 'postcss';

const REM = /(-?\d*\.?\d+)rem\b/g;

/** Rewrites rem to px at 16px so a host page's root font size can't rescale the overlay (D4). */
export const remToPx: PluginCreator<void> = () => ({
  postcssPlugin: 'spart-rem-to-px',
  Declaration(decl) {
    if (decl.value.includes('rem')) {
      decl.value = decl.value.replace(
        REM,
        (_, n: string) => `${Math.round(Number(n) * 16 * 1000) / 1000}px`
      );
    }
  },
});
remToPx.postcss = true;
