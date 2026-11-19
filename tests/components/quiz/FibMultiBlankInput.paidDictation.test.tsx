import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type {
  DictationController,
  UseDictationOptions,
} from '@/utils/speechToText/types';
import { joinBlanks, splitBlanks } from '@/utils/quizFibBlanks';

const hook = vi.hoisted(() => ({
  options: null as UseDictationOptions | null,
}));

vi.mock('@/hooks/useDictation', () => ({
  useDictation: (options: UseDictationOptions): DictationController => {
    hook.options = options;
    return {
      supported: true,
      status: 'idle',
      error: null,
      interim: '',
      language: 'en',
      languages: options.languages,
      setLanguage: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      toggle: () => undefined,
    };
  },
}));
vi.mock('@/components/common/dictate/DictateButton', () => ({
  DictateButton: () => <button type="button">Dictate</button>,
}));

import { FibMultiBlankInput } from '@/components/quiz/FibMultiBlankInput';

const Blanks: React.FC<{
  onInsert: (text: string) => void;
  paid?: boolean;
}> = ({ onInsert, paid = true }) => {
  const [value, setValue] = useState(joinBlanks(['red', '']));
  return (
    <FibMultiBlankInput
      count={2}
      value={value}
      onChange={setValue}
      onEnter={vi.fn()}
      disabled={false}
      light
      inputClassName=""
      dictation={{
        languages: ['en'],
        onInsert,
        ...(paid ? { paid: { assignmentId: 'asn-1' } } : {}),
      }}
    />
  );
};

const blank = (n: number) =>
  screen.getByLabelText<HTMLInputElement>(`Blank ${n}`);

beforeEach(() => {
  hook.options = null;
});

describe('FibMultiBlankInput: paid revision', () => {
  it('passes paid through to the hook', () => {
    const { unmount } = render(<Blanks onInsert={vi.fn()} paid={false} />);
    expect(hook.options?.paid).toBeUndefined();
    unmount();
    render(<Blanks onInsert={vi.fn()} />);
    expect(hook.options?.paid).toEqual({ assignmentId: 'asn-1' });
  });

  it('revises the blank while it still holds the dictated phrase', () => {
    const onInsert = vi.fn();
    render(<Blanks onInsert={onInsert} />);
    fireEvent.focus(blank(2));
    act(() => hook.options?.onCommit(' Blue wail.'));
    expect(blank(2).value).toBe('Blue wail');
    onInsert.mockClear();
    act(() => hook.options?.onRevise?.(' Blue wail.', ' Blue whale.'));
    expect(blank(2).value).toBe('Blue whale');
    expect(blank(1).value).toBe('red');
    expect(onInsert).toHaveBeenCalledWith('Blue whale');
  });

  it('leaves the blank alone once the student changed it', () => {
    const onInsert = vi.fn();
    render(<Blanks onInsert={onInsert} />);
    fireEvent.focus(blank(2));
    act(() => hook.options?.onCommit(' Blue wail.'));
    fireEvent.change(blank(2), { target: { value: 'Orca' } });
    onInsert.mockClear();
    act(() => hook.options?.onRevise?.(' Blue wail.', ' Blue whale.'));
    expect(splitBlanks(joinBlanks([blank(1).value, blank(2).value]))).toEqual([
      'red',
      'Orca',
    ]);
    expect(onInsert).not.toHaveBeenCalled();
  });
});
