import { describe, expect, it, vi } from 'vitest';
import { insertAtCursor, isTypingTarget } from './insertAtCursor';

describe('insertAtCursor', () => {
  it('types at the caret of a text box and fires input', () => {
    const input = document.createElement('input');
    input.value = 'cancion';
    document.body.append(input);
    input.setSelectionRange(5, 6);
    const onInput = vi.fn();
    input.addEventListener('input', onInput);
    insertAtCursor(input, 'ó');
    expect(input.value).toBe('canción');
    expect(input.selectionStart).toBe(6);
    expect(onInput).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('only treats editable text boxes as targets', () => {
    const text = document.createElement('input');
    const box = document.createElement('input');
    box.type = 'checkbox';
    const locked = document.createElement('textarea');
    locked.disabled = true;
    expect(isTypingTarget(text)).toBe(true);
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(locked)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
