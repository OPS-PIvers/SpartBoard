import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useClickOutside } from './useClickOutside';

describe('useClickOutside', () => {
  const elementsToCleanup: HTMLElement[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    elementsToCleanup.forEach((el) => {
      if (document.body.contains(el)) {
        document.body.removeChild(el);
      }
    });
    elementsToCleanup.length = 0;
  });

  it('should call handler when clicking outside', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);

    renderHook(() => useClickOutside(ref, handler));

    const event = new MouseEvent('mousedown', { bubbles: true });
    document.body.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should call handler when touching outside', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);

    renderHook(() => useClickOutside(ref, handler));

    const event = new TouchEvent('touchstart', { bubbles: true });
    document.body.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not call handler when clicking inside', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);

    renderHook(() => useClickOutside(ref, handler));

    const event = new MouseEvent('mousedown', { bubbles: true });
    ref.current.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should not call handler when clicking on element with data-click-outside-ignore', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ref = { current: div };
    document.body.appendChild(div);
    elementsToCleanup.push(div);

    const portalDiv = document.createElement('div');
    portalDiv.dataset.clickOutsideIgnore = 'true';
    const portalChild = document.createElement('button');
    portalDiv.appendChild(portalChild);
    document.body.appendChild(portalDiv);
    elementsToCleanup.push(portalDiv);

    renderHook(() => useClickOutside(ref, handler));

    const event = new MouseEvent('mousedown', { bubbles: true });
    portalChild.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should not call handler when clicking on ignored ref', () => {
    const handler = vi.fn();
    const div = document.createElement('div');
    const ignoreDiv = document.createElement('div');
    const ref = { current: div };
    const ignoreRef = { current: ignoreDiv };

    document.body.appendChild(div);
    document.body.appendChild(ignoreDiv);
    elementsToCleanup.push(div, ignoreDiv);

    renderHook(() => useClickOutside(ref, handler, [ignoreRef]));

    const event = new MouseEvent('mousedown', { bubbles: true });
    ignoreRef.current.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
  });
});
