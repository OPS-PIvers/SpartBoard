import { describe, expect, it } from 'vitest';
import { MATH_PLAIN_ATTR, plainMathHtml } from './mathChips';

describe('plainMathHtml', () => {
  it('saves each drawn equation as its plain math text', () => {
    const root = document.createElement('div');
    root.innerHTML = `<p>So <span data-math="\\frac{1}{2}" ${MATH_PLAIN_ATTR}="1/2" contenteditable="false"><span class="ML__latex">12</span></span> ok</p>`;
    expect(plainMathHtml(root)).toBe(
      '<p>So <span data-math="\\frac{1}{2}">1/2</span> ok</p>'
    );
    // The live editor keeps its drawn equation.
    expect(root.querySelector('.ML__latex')).not.toBeNull();
  });

  it('returns the HTML as is when nothing is drawn', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>No math</p>';
    expect(plainMathHtml(root)).toBe('<p>No math</p>');
  });
});
