import { describe, it, expect, afterEach } from 'vitest';
import { setGroupBoxOffset } from './groupBoxOffset';

describe('setGroupBoxOffset', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves the group box with a drag and clears on drop', () => {
    const box = document.createElement('div');
    box.setAttribute('data-group-bbox', '');
    document.body.appendChild(box);
    setGroupBoxOffset(40, -12);
    expect(box.style.transform).toBe('translate(40px, -12px)');
    setGroupBoxOffset(0, 0);
    expect(box.style.transform).toBe('');
  });

  it('does nothing without a group box', () => {
    expect(() => setGroupBoxOffset(5, 5)).not.toThrow();
  });
});
