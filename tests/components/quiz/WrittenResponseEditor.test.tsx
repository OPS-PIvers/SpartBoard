import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WrittenResponseEditor } from '@/components/quiz/WrittenResponseEditor';

const getEditor = (): HTMLElement => {
  const editor = screen.getByRole('textbox', { name: /your response/i });
  return editor;
};

describe('WrittenResponseEditor', () => {
  it('renders placeholder text when empty', () => {
    render(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        placeholder="Type your answer…"
        questionKey="q1"
      />
    );
    expect(screen.getByText('Type your answer…')).toBeInTheDocument();
  });

  it('seeds contenteditable from `value` prop on mount', () => {
    render(
      <WrittenResponseEditor
        value="<b>hello</b> world"
        onChange={vi.fn()}
        questionKey="q1"
      />
    );
    const editor = getEditor();
    expect(editor.innerHTML).toContain('<b>hello</b>');
    expect(editor.textContent).toContain('hello world');
  });

  it('fires sanitized onChange when content changes', () => {
    const onChange = vi.fn();
    render(
      <WrittenResponseEditor value="" onChange={onChange} questionKey="q1" />
    );
    const editor = getEditor();
    // Simulate paste-style input — set innerHTML directly then fire `input`.
    // The editor sanitizes on each input event and reports the cleaned HTML.
    editor.innerHTML = '<span style="color:red">x</span>';
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).not.toContain('<span');
    expect(lastCall).toContain('x');
  });

  it('shows a word count and updates with text length', () => {
    render(
      <WrittenResponseEditor
        value="one two three"
        onChange={vi.fn()}
        questionKey="q1"
      />
    );
    expect(screen.getByText(/3 \/?\s*words?/i)).toBeInTheDocument();
  });

  it('warns past maxWords cap', () => {
    render(
      <WrittenResponseEditor
        value="one two three four five"
        onChange={vi.fn()}
        maxWords={3}
        questionKey="q1"
      />
    );
    expect(
      screen.getByText(/past the suggested word cap/i)
    ).toBeInTheDocument();
  });

  it('does NOT warn when at or below maxWords', () => {
    render(
      <WrittenResponseEditor
        value="one two three"
        onChange={vi.fn()}
        maxWords={5}
        questionKey="q1"
      />
    );
    expect(
      screen.queryByText(/past the suggested word cap/i)
    ).not.toBeInTheDocument();
  });

  it('remounts and reseeds when questionKey changes (pause/resume)', () => {
    const { rerender } = render(
      <WrittenResponseEditor
        value="first answer"
        onChange={vi.fn()}
        questionKey="q1"
      />
    );
    expect(getEditor().textContent).toContain('first answer');
    rerender(
      <WrittenResponseEditor
        value="second answer"
        onChange={vi.fn()}
        questionKey="q2"
      />
    );
    expect(getEditor().textContent).toContain('second answer');
  });

  it('shows list controls only in essay mode', () => {
    const { rerender } = render(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="q1"
        isEssay={false}
      />
    );
    expect(
      screen.queryByRole('button', { name: /bulleted list/i })
    ).not.toBeInTheDocument();
    rerender(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="q1"
        isEssay={true}
      />
    );
    expect(
      screen.getByRole('button', { name: /bulleted list/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /numbered list/i })
    ).toBeInTheDocument();
  });

  // jsdom does not implement document.execCommand, so install a stub the
  // editor's paste handler can call (and we can assert against).
  type ExecHost = { execCommand?: unknown };
  const withExecStub = (run: (exec: ReturnType<typeof vi.fn>) => void) => {
    const exec = vi.fn();
    const prev = (document as ExecHost).execCommand;
    (document as ExecHost).execCommand = exec;
    try {
      run(exec);
    } finally {
      (document as ExecHost).execCommand = prev;
    }
  };

  it('inserts pasted plain text when clipboard is not blocked (default)', () => {
    withExecStub((exec) => {
      render(
        <WrittenResponseEditor value="" onChange={vi.fn()} questionKey="q1" />
      );
      const notPrevented = fireEvent.paste(getEditor(), {
        clipboardData: { getData: () => 'pasted text' },
      });
      // Default action is prevented (we always strip formatting), but the
      // plain text IS inserted via execCommand.
      expect(notPrevented).toBe(false);
      expect(exec).toHaveBeenCalledWith('insertText', false, 'pasted text');
    });
  });

  it('suppresses paste entirely when blockClipboard is set', () => {
    withExecStub((exec) => {
      render(
        <WrittenResponseEditor
          value=""
          onChange={vi.fn()}
          questionKey="q1"
          blockClipboard
        />
      );
      const prevented = fireEvent.paste(getEditor(), {
        clipboardData: { getData: () => 'pasted text' },
      });
      expect(prevented).toBe(false); // default prevented
      // Nothing inserted — the blocked path bails before execCommand.
      expect(exec).not.toHaveBeenCalled();
    });
  });

  it('blocks copy and cut when blockClipboard is set', () => {
    render(
      <WrittenResponseEditor
        value="secret answer"
        onChange={vi.fn()}
        questionKey="q1"
        blockClipboard
      />
    );
    expect(fireEvent.copy(getEditor())).toBe(false);
    expect(fireEvent.cut(getEditor())).toBe(false);
  });

  it('allows copy and cut when clipboard is not blocked (default)', () => {
    render(
      <WrittenResponseEditor
        value="answer"
        onChange={vi.fn()}
        questionKey="q1"
      />
    );
    expect(fireEvent.copy(getEditor())).toBe(true);
    expect(fireEvent.cut(getEditor())).toBe(true);
  });

  it('blocks drag-and-drop when blockClipboard is set, allows it otherwise', () => {
    const { rerender } = render(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="q1"
        blockClipboard
      />
    );
    expect(
      fireEvent.drop(getEditor(), { dataTransfer: { getData: () => 'x' } })
    ).toBe(false);

    rerender(
      <WrittenResponseEditor value="" onChange={vi.fn()} questionKey="q2" />
    );
    expect(
      fireEvent.drop(getEditor(), { dataTransfer: { getData: () => 'x' } })
    ).toBe(true);
  });

  it('disables editing and tab focus when disabled', () => {
    render(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="q1"
        disabled
      />
    );
    const editor = getEditor();
    expect(editor.getAttribute('contenteditable')).toBe('false');
    expect(editor.getAttribute('tabindex')).toBe('-1');
    expect(editor.getAttribute('aria-disabled')).toBe('true');
  });
});
