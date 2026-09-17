import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { captureCaret, restoreCaret } from '@/utils/plcNoteCaret';
import { applyTextEdit, noteBody } from '@/utils/plcNoteCrdt';

/** A local doc plus a focused textarea mirroring its body. */
function editor(initial: string) {
  const doc = new Y.Doc();
  const text = noteBody(doc);
  applyTextEdit(text, initial);

  const el = document.createElement('textarea');
  el.value = text.toJSON();
  document.body.append(el);
  el.focus();

  /** Apply a remote update the way the transport will: capture, apply, restore. */
  const receive = (update: Uint8Array) => {
    const captured = captureCaret(text, el);
    Y.applyUpdate(doc, update);
    el.value = text.toJSON();
    restoreCaret(text, el, captured);
  };

  return { doc, text, el, receive };
}

/** An edit made by the other teacher, as an update to hand to `receive`. */
function remoteEdit(from: Y.Doc, edit: (text: Y.Text) => void): Uint8Array {
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(from));
  const before = Y.encodeStateVector(peer);
  edit(noteBody(peer));
  return Y.encodeStateAsUpdate(peer, before);
}

describe('caret preservation', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('shifts the caret when a teammate inserts above it', () => {
    const { doc, el, receive } = editor('line one\nline two');
    el.setSelectionRange(14, 14); // inside "line two"

    receive(remoteEdit(doc, (text) => text.insert(0, 'HEADER\n')));

    expect(el.value).toBe('HEADER\nline one\nline two');
    expect(el.selectionStart).toBe(21);
    expect(el.selectionEnd).toBe(21);
  });

  it('leaves the caret alone when the edit is below it', () => {
    const { doc, el, receive } = editor('line one\nline two');
    el.setSelectionRange(4, 4);

    receive(
      remoteEdit(doc, (text) => text.insert(text.length, '\nline three'))
    );

    expect(el.selectionStart).toBe(4);
  });

  it('pulls the caret back when a teammate deletes above it', () => {
    const { doc, el, receive } = editor('remove me\nkeep this');
    el.setSelectionRange(15, 15); // inside "keep this"

    receive(remoteEdit(doc, (text) => text.delete(0, 10)));

    expect(el.value).toBe('keep this');
    expect(el.selectionStart).toBe(5);
  });

  it('preserves a selection range across a remote insert', () => {
    const { doc, el, receive } = editor('alpha beta');
    el.setSelectionRange(6, 10); // "beta"

    receive(remoteEdit(doc, (text) => text.insert(0, '>> ')));

    expect(el.value).toBe('>> alpha beta');
    expect(el.selectionStart).toBe(9);
    expect(el.selectionEnd).toBe(13);
  });

  it('captures nothing when the field is not focused', () => {
    const { text, el } = editor('anything');
    el.blur();
    expect(captureCaret(text, el)).toBeNull();
  });

  it('is a no-op when there is nothing captured', () => {
    const { text, el } = editor('anything');
    el.setSelectionRange(3, 3);
    restoreCaret(text, el, null);
    expect(el.selectionStart).toBe(3);
  });
});
