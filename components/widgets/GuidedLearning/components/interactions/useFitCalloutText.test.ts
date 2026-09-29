import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIT_BODY_VAR, measureCalloutFit } from './useFitCalloutText';
import { createGesturePreview } from '../studio/gesturePreview';

// Card height is 5 lines of the body size; a live transition would freeze it, as in a browser.
const original = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetHeight'
) as PropertyDescriptor;

function fakeLayout() {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.style.transition !== 'none') return 5 * 12;
      return 5 * parseFloat(this.style.getPropertyValue(FIT_BODY_VAR) || '0');
    },
  });
}

function stage() {
  const root = document.createElement('div');
  root.innerHTML = `<div><div data-gl-callout="s1" style="width: 200px; min-height: 80px; ${FIT_BODY_VAR}: 14px; transition: all 200ms">Text</div></div>`;
  document.body.appendChild(root);
  return {
    root,
    card: root.querySelector<HTMLElement>('[data-gl-callout]') as HTMLElement,
  };
}

describe('measureCalloutFit', () => {
  beforeEach(fakeLayout);
  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original);
    document.body.innerHTML = '';
  });

  it('scales the text with the box height, ignoring the card transition', () => {
    const { card } = stage();
    expect(measureCalloutFit(card, 200, 100).bodyPx).toBe(20);
    expect(measureCalloutFit(card, 200, 150).bodyPx).toBe(30);
    expect(card.parentElement?.children).toHaveLength(1);
  });

  it('refits the card on every preview frame and restores it after', () => {
    const { root, card } = stage();
    const preview = createGesturePreview(root, 's1', {
      callout: 'card',
      spot: false,
    });
    preview.size(200, 100);
    expect(card.style.getPropertyValue(FIT_BODY_VAR)).toBe('20px');
    preview.size(200, 130);
    expect(card.style.getPropertyValue(FIT_BODY_VAR)).toBe('26px');
    expect(card.style.minHeight).toBe('130px');
    preview.restore();
    expect(card.style.getPropertyValue(FIT_BODY_VAR)).toBe('14px');
    expect(card.style.minHeight).toBe('80px');
  });
});
