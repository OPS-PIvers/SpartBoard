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
