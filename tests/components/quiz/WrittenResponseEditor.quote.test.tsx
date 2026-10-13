import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import {
  WrittenResponseEditor,
  type WrittenResponseEditorHandle,
} from '@/components/quiz/WrittenResponseEditor';

describe('WrittenResponseEditor insertQuote', () => {
  it('appends a tracked quote after existing text and reports it', () => {
    const onChange = vi.fn<(html: string) => void>();
    const ref = React.createRef<WrittenResponseEditorHandle>();
    render(
      <WrittenResponseEditor
        ref={ref}
        value="<p>The effect was small.</p>"
        onChange={onChange}
        questionKey="q1"
      />
    );
    act(() =>
      ref.current?.insertQuote({ stimulusId: 's1', text: 'not large' })
    );
    expect(onChange.mock.lastCall?.[0]).toBe(
      '<p>The effect was small. “<span data-quote="s1" data-quote-text="not large">not large</span>”&nbsp;</p>'
    );
  });

  it('keeps highlighted writing and inserts the quote after it', () => {
    const onChange = vi.fn<(html: string) => void>();
    const ref = React.createRef<WrittenResponseEditorHandle>();
    const { container } = render(
      <WrittenResponseEditor
        ref={ref}
        value="<p>The effect was small.</p>"
        onChange={onChange}
        questionKey="q1"
      />
    );
    const text = container.querySelector('[contenteditable] p')?.firstChild;
    if (!text) throw new Error('editor paragraph missing');
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 10);
    const selection = window.getSelection();
    if (!selection) throw new Error('no selection');
    selection.removeAllRanges();
    selection.addRange(range);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    act(() =>
      ref.current?.insertQuote({ stimulusId: 's1', text: 'not large' })
    );
    const html = onChange.mock.lastCall?.[0] ?? '';
    expect(html).toContain('The effect');
    expect(html).toContain('was small.');
    expect(html).toContain('data-quote="s1"');
  });

  it('does nothing when the editor is disabled', () => {
    const onChange = vi.fn<(html: string) => void>();
    const ref = React.createRef<WrittenResponseEditorHandle>();
    render(
      <WrittenResponseEditor
        ref={ref}
        value=""
        onChange={onChange}
        questionKey="q1"
        disabled
      />
    );
    act(() => ref.current?.insertQuote({ stimulusId: 's1', text: 'x' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
