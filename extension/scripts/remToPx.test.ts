import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { remToPx } from './remToPx';

const run = (css: string) =>
  postcss([remToPx()]).process(css, { from: undefined }).css;

describe('remToPx', () => {
  it('rewrites every rem value at 16px', () => {
    expect(
      run('.a{padding:0.75rem 1rem;margin:-.5rem;top:calc(1.5rem + 2px)}')
    ).toBe('.a{padding:12px 16px;margin:-8px;top:calc(24px + 2px)}');
  });

  it('leaves other units and names alone', () => {
    expect(run('.b{width:2em;font-size:10px;animation:remote 1s}')).toBe(
      '.b{width:2em;font-size:10px;animation:remote 1s}'
    );
  });
});
