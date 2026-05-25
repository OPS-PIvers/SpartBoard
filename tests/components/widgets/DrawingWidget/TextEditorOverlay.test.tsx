import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { TextEditorOverlay } from '@/components/widgets/DrawingWidget/TextEditorOverlay';
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
