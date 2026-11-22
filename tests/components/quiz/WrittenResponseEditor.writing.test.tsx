import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { WrittenResponseEditor } from '@/components/quiz/WrittenResponseEditor';

const editor = () => screen.getByRole('textbox', { name: /your response/i });

const pasteEvent = (text: string) => {
  const e = createEvent.paste(editor(), {
    clipboardData: { getData: () => text },
  });
  return e;
};

describe('WrittenResponseEditor writing hooks', () => {
  it('asks the page before inserting a paste and drops a refused one', () => {
    const allowInsert = vi.fn(() => false);
    const exec = vi.fn();
    document.execCommand = exec;
    render(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="w"
        allowInsert={allowInsert}
      />
    );
    fireEvent(editor(), pasteEvent('from a website'));
    expect(allowInsert).toHaveBeenCalledWith('from a website', 'paste');
    expect(exec).not.toHaveBeenCalled();
  });

  it('inserts an allowed paste as plain text', () => {
    const exec = vi.fn();
    document.execCommand = exec;
    render(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="w"
        allowInsert={() => true}
      />
    );
    fireEvent(editor(), pasteEvent('my own sentence'));
    expect(exec).toHaveBeenCalledWith('insertText', false, 'my own sentence');
  });

  it('reports the copied text and blocks an outside drop', () => {
    const onCopyText = vi.fn();
    const allowInsert = vi.fn(
      (_t: string, via: string) => via === 'drag-inside'
    );
    vi.spyOn(document, 'getSelection').mockReturnValue({
      toString: () => 'moved words',
    } as unknown as Selection);
    render(
      <WrittenResponseEditor
        value="<p>moved words</p>"
        onChange={vi.fn()}
        questionKey="w"
        allowInsert={allowInsert}
        onCopyText={onCopyText}
      />
    );
    fireEvent.copy(editor());
    expect(onCopyText).toHaveBeenCalledWith('moved words');
    const outside = createEvent.drop(editor(), {
      dataTransfer: { getData: () => 'outside' },
    });
    fireEvent(editor(), outside);
    expect(outside.defaultPrevented).toBe(true);
    fireEvent.dragStart(editor());
    const inside = createEvent.drop(editor(), {
      dataTransfer: { getData: () => 'moved words' },
    });
    fireEvent(editor(), inside);
    expect(inside.defaultPrevented).toBe(false);
    expect(allowInsert).toHaveBeenLastCalledWith('moved words', 'drag-inside');
  });

  it('blocks the right-click menu only when asked (D4)', () => {
    const { rerender } = render(
      <WrittenResponseEditor value="" onChange={vi.fn()} questionKey="w" />
    );
    const open = createEvent.contextMenu(editor());
    fireEvent(editor(), open);
    expect(open.defaultPrevented).toBe(false);
    rerender(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="w"
        blockContextMenu
      />
    );
    const blocked = createEvent.contextMenu(editor());
    fireEvent(editor(), blocked);
    expect(blocked.defaultPrevented).toBe(true);
  });
});
