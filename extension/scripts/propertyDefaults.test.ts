import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { propertyDefaults } from './propertyDefaults';

const run = (css: string) =>
  postcss([propertyDefaults()]).process(css, { from: undefined }).css;

describe('propertyDefaults', () => {
  it("unwraps Tailwind's @property fallback so it always applies", () => {
    expect(
      run(
        '@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))){*,:before{--tw-shadow:0 0 #0000}}}'
      )
    ).toBe('@layer properties{*,:before{--tw-shadow:0 0 #0000}}');
  });

  it('leaves other @supports rules alone', () => {
    const css = '@supports (display:grid){.a{display:grid}}';
    expect(run(css)).toBe(css);
  });
});
