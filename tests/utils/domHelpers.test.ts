import { describe, it, expect } from 'vitest';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';

/** Dispatch a real keydown event and capture it at document level. */
function fireEscape(target: HTMLElement): boolean {
  let result = false;
  const capture = (e: KeyboardEvent) => {
    result = isEscapeFromWidgetInput(e);
  };
  document.addEventListener('keydown', capture);
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  );
  document.removeEventListener('keydown', capture);
  return result;
}

function inPortal(child: HTMLElement): HTMLElement {
  const portal = document.createElement('div');
  portal.setAttribute('data-widget-portal', '');
  portal.appendChild(child);
  document.body.appendChild(portal);
  return portal;
}

function inWindow(child: HTMLElement): HTMLElement {
  const win = document.createElement('div');
  win.setAttribute('data-draggable-window', '');
  win.appendChild(child);
  document.body.appendChild(win);
  return win;
}

describe('isEscapeFromWidgetInput', () => {
  it('returns true for an input inside data-draggable-window', () => {
    const input = document.createElement('input');
    const container = inWindow(input);
    expect(fireEscape(input)).toBe(true);
    container.remove();
  });

  it('returns true for a textarea inside data-draggable-window', () => {
    const textarea = document.createElement('textarea');
    const container = inWindow(textarea);
    expect(fireEscape(textarea)).toBe(true);
    container.remove();
  });

  it('returns false for a button inside data-draggable-window', () => {
    const button = document.createElement('button');
    const container = inWindow(button);
    expect(fireEscape(button)).toBe(false);
    container.remove();
  });

  it('returns true for an input inside data-widget-portal', () => {
    const input = document.createElement('input');
    const portal = inPortal(input);
    expect(fireEscape(input)).toBe(true);
    portal.remove();
  });

  it('returns true for a button inside data-widget-portal', () => {
    const button = document.createElement('button');
    const portal = inPortal(button);
    expect(fireEscape(button)).toBe(true);
    portal.remove();
  });

  it('returns false for a text input outside both zones', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(fireEscape(input)).toBe(false);
    input.remove();
  });

  it('returns false for a button outside both zones', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    expect(fireEscape(button)).toBe(false);
    button.remove();
  });
});
