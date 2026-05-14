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
