/** Types `text` into a text box or rich-text editor at its caret, firing the usual input event. */
export function insertAtCursor(el: HTMLElement, text: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.setRangeText(text, start, end, 'end');
    // React's value tracker still holds the old value, so this reaches onChange.
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (el.isContentEditable) {
    el.focus();
    document.execCommand('insertText', false, text);
  }
}

/** True for boxes a student types an answer into. */
export function isTypingTarget(el: EventTarget | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement)
    return (
      ['text', 'search', ''].includes(el.type) && !el.readOnly && !el.disabled
    );
  return el instanceof HTMLElement && el.isContentEditable;
}
