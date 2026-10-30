import type { PluginCreator } from 'postcss';

// Tailwind v4 only applies its --tw-* defaults where @property is unsupported; Chrome ignores @property in a shadow root.
const FALLBACK = /-webkit-hyphens:\s*none/;

/** Makes Tailwind's @property fallback unconditional so shadows, rings and transforms work inside the overlay's shadow root. */
export const propertyDefaults: PluginCreator<void> = () => ({
  postcssPlugin: 'spart-property-defaults',
  AtRule: {
    supports(rule) {
      if (FALLBACK.test(rule.params)) rule.replaceWith(rule.nodes ?? []);
    },
  },
});
propertyDefaults.postcss = true;
