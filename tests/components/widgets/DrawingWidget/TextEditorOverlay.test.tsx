import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import {
  TextEditorOverlay,
  TextEditorHandle,
} from '@/components/widgets/DrawingWidget/TextEditorOverlay';
import type { TextObject } from '@/types';

const baseObject = (overrides: Partial<TextObject> = {}): TextObject => ({
  id: 'txt-1',
  kind: 'text',
  z: 0,
  x: 10,
  y: 20,
  w: 200,
  h: 48,
  content: '',
  fontFamily: 'sans-serif',
  fontSize: 24,
  color: '#000000',
  ...overrides,
});

const canvasRect = {
  left: 0,
  top: 0,
  width: 800,
  height: 600,
  right: 800,
  bottom: 600,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

const canvasSize = { width: 800, height: 600 };

describe('TextEditorOverlay', () => {
  it('mounts focused with the object content seeded', () => {
    const { container } = render(
      <TextEditorOverlay
        object={baseObject({ content: 'hello' })}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const editor = container.querySelector('[role="textbox"]');
    expect(editor).not.toBeNull();
    expect((editor as HTMLElement).innerText).toBe('hello');
    expect(document.activeElement).toBe(editor);
  });

  it('Cmd+Enter commits the current innerText through onCommit', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <TextEditorOverlay
        object={baseObject()}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    // Simulate typing — bypass IME by directly setting innerText.
    act(() => {
      editor.innerText = 'hello world';
    });
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as TextObject;
    expect(committed.content).toBe('hello world');
    expect(committed.id).toBe('txt-1');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Ctrl+Enter also commits (Windows shortcut)', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <TextEditorOverlay
        object={baseObject()}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    act(() => {
      editor.innerText = 'win';
    });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onCancel without onCommit', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <TextEditorOverlay
        object={baseObject()}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    act(() => {
      editor.innerText = 'ignored';
    });
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits on blur', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <TextEditorOverlay
        object={baseObject()}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    act(() => {
      editor.innerText = 'after blur';
    });
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as TextObject;
    expect(committed.content).toBe('after blur');
  });

  it('empty (whitespace-only) commit fires onCommit with the empty content (caller decides remove vs no-op)', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <TextEditorOverlay
        object={baseObject()}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    act(() => {
      editor.innerText = '   ';
    });
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    // The editor itself no longer makes the empty-removes-object decision —
    // that's the caller's job. The committed content is the whitespace-only
    // string (caller will see content.trim() === '' and act accordingly).
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as TextObject;
    expect(committed.content.trim()).toBe('');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('stops React-synthetic keydown propagation (Backspace/Arrow keys do not bubble to canvas-level handlers)', () => {
    // The wrapper this overlay mounts inside (Widget / AnnotationOverlay)
    // attaches its own onKeyDown for selection/undo. We assert the editor's
    // handler invokes `stopPropagation` on its synthetic event so those
    // wrappers never see Backspace/Arrow keys while editing. We probe this
    // via an ancestor React handler — synthetic propagation is gated.
    const ancestorHandler = vi.fn();
    const { container } = render(
      <div onKeyDown={ancestorHandler}>
        <TextEditorOverlay
          object={baseObject({ content: 'edit me' })}
          canvasRect={canvasRect}
          canvasSize={canvasSize}
          onCommit={vi.fn()}
          onCancel={vi.fn()}
        />
      </div>
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    fireEvent.keyDown(editor, { key: 'Backspace' });
    expect(ancestorHandler).not.toHaveBeenCalled();
    // Arrow keys also stay local to the editor.
    fireEvent.keyDown(editor, { key: 'ArrowLeft' });
    expect(ancestorHandler).not.toHaveBeenCalled();
  });

  it('blur after commit does not double-fire onCommit', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <TextEditorOverlay
        object={baseObject()}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    act(() => {
      editor.innerText = 'once';
    });
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('TextEditorOverlay — unsaved-content guards', () => {
  it('REGRESSION: swapping to a new object while unfinalized commits the previous text first', () => {
    // Clicking the canvas with the text tool spawns a fresh object BEFORE
    // blur fires. Reseeding the editor used to wipe the old text so the
    // late blur committed an empty string and the note vanished.
    const onCommit = vi.fn();
    const { container, rerender } = render(
      <TextEditorOverlay
        object={baseObject({ id: 'first' })}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    act(() => {
      editor.innerText = 'keep me';
    });
    rerender(
      <TextEditorOverlay
        object={baseObject({ id: 'second' })}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0] as TextObject;
    expect(committed.id).toBe('first');
    expect(committed.content).toBe('keep me');
    // The editor now holds the new (empty) object.
    expect(editor.innerText).toBe('');
    // A later blur commits the second object, not the first again.
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect((onCommit.mock.calls[1][0] as TextObject).id).toBe('second');
  });

  it('exposes an imperative commit() handle that commits once', () => {
    const onCommit = vi.fn();
    const ref = React.createRef<TextEditorHandle>();
    const { container } = render(
      <TextEditorOverlay
        ref={ref}
        object={baseObject()}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    act(() => {
      editor.innerText = 'via handle';
    });
    act(() => {
      ref.current?.commit();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect((onCommit.mock.calls[0][0] as TextObject).content).toBe(
      'via handle'
    );
    // The blur that follows unmount/refocus must not double-commit.
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('wrap mode keeps the handle-set width on commit; free mode does not', () => {
    const onCommit = vi.fn();
    const { container, rerender } = render(
      <TextEditorOverlay
        object={baseObject({ w: 333, wrap: true })}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    const editor = container.querySelector('[role="textbox"]') as HTMLElement;
    expect(editor.style.width).toBe('333px');
    expect(editor.className).toContain('whitespace-pre-wrap');
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    expect((onCommit.mock.calls[0][0] as TextObject).w).toBe(333);

    rerender(
      <TextEditorOverlay
        object={baseObject({ id: 'free', w: 333 })}
        canvasRect={canvasRect}
        canvasSize={canvasSize}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />
    );
    expect(editor.style.width).toBe('');
    expect(editor.className).toContain('whitespace-pre');
    expect(editor.className).not.toContain('whitespace-pre-wrap');
  });
});
