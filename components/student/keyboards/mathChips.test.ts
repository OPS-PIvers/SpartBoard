import { describe, expect, it } from 'vitest';
import {
  MATH_PLAIN_ATTR,
  plainMathHtml,
  safeMathStyle,
  sanitizeMathMarkup,
} from './mathChips';

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

describe('sanitizeMathMarkup', () => {
  const draw = (html: string): HTMLElement => {
    const root = document.createElement('div');
    root.innerHTML = sanitizeMathMarkup(html);
    return root;
  };

  it('drops author classes, ids and data attributes from class, cssId and htmlData commands', () => {
    const root = draw(
      '<span class="ML__latex"><span class="fixed inset-0 z-50 ML__base" id="evil" data-foo="bar"><span class="ML__mathit">x</span></span></span>'
    );
    const inner = root.querySelector('span span') as HTMLElement;
    expect(inner.getAttribute('class')).toBe('ML__base');
    expect(inner.hasAttribute('id')).toBe(false);
    expect(inner.hasAttribute('data-foo')).toBe(false);
    expect(root.querySelector('.ML__mathit')).not.toBeNull();
  });

  it('drops fixed positions, URLs and huge sizes but keeps MathLive layout', () => {
    const root = draw(
      '<span class="ML__latex"><span class="ML__strut" style="height:100.44em"></span>' +
        '<span style="position:fixed;top:0;background:url(http://e/x.png);z-index:9999;width:100vw"></span>' +
        '<span class="ML__mspace" style="margin-left:900em"></span>' +
        '<span style="display:inline-block;position:relative;height:1.43em;vertical-align:-0.43em;font-size: 248.8%;color:#d7170b"></span></span>'
    );
    const spans = root.querySelectorAll('span span');
    expect(spans[0].hasAttribute('style')).toBe(false);
    expect(spans[1].getAttribute('style')).toBe('top:0');
    expect(spans[2].hasAttribute('style')).toBe(false);
    expect(spans[3].getAttribute('style')).toBe(
      'display:inline-block;position:relative;height:1.43em;vertical-align:-0.43em;font-size:248.8%;color:#d7170b'
    );
    expect(root.innerHTML).not.toMatch(/url\(|fixed|9999|900em/);
  });

  it('keeps stretchy SVG sizing', () => {
    const root = draw(
      '<span class="ML__stretchy"><svg width="400em" height="0.522em" viewBox="0 0 400000 522" preserveAspectRatio="xMaxYMin slice"><path d="M0 0"></path></svg></span>'
    );
    expect(root.querySelector('svg')?.getAttribute('width')).toBe('400em');
  });

  it('refuses oversized markup', () => {
    expect(sanitizeMathMarkup('<span>' + 'x'.repeat(300_000) + '</span>')).toBe(
      ''
    );
  });
});

describe('safeMathStyle', () => {
  it('keeps calc widths and borders MathLive writes', () => {
    expect(
      safeMathStyle('left:calc(-1 * 1px - 0.3em);border:0.04em solid #000000')
    ).toBe('left:calc(-1 * 1px - 0.3em);border:0.04em solid #000000');
  });
  it('drops expressions and unknown properties', () => {
    expect(
      safeMathStyle(
        'background-image:url(x);color:expression(alert(1));transform:scale(99)'
      )
    ).toBe('');
  });
});
