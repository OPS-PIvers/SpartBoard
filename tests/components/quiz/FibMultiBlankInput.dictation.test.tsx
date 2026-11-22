import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type {
  DictationController,
  UseDictationOptions,
} from '@/utils/speechToText/types';
import { DICTATION_EVENT } from '@/utils/inputSignals';
import { joinBlanks } from '@/utils/quizFibBlanks';

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
  DictateButton: ({ size }: { size?: string }) => (
    <button type="button" data-size={size}>
      Dictate
    </button>
  ),
}));

import { FibMultiBlankInput } from '@/components/quiz/FibMultiBlankInput';
import { blankPhrase } from '@/utils/speechToText/blankPhrase';

const renderBlanks = (
  value: string,
  onChange: (next: string) => void,
  onInsert?: (text: string) => void
) =>
  render(
    <FibMultiBlankInput
      count={2}
      value={value}
      onChange={onChange}
      onEnter={vi.fn()}
      disabled={false}
      light
      inputClassName=""
      dictation={onInsert ? { languages: ['en'], onInsert } : undefined}
    />
  );

beforeEach(() => {
  hook.options = null;
});

describe('blankPhrase', () => {
  it('drops the leading space and closing punctuation', () => {
    expect(blankPhrase(' The mitochondria.')).toBe('The mitochondria');
    expect(blankPhrase('Dr. Seuss?!')).toBe('Dr. Seuss');
    expect(blankPhrase(' . ')).toBe('');
  });
});

describe('FibMultiBlankInput dictation', () => {
  it('shows no mic without the prop', () => {
    renderBlanks('', vi.fn());
    expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull();
  });

  it('fills the blank the student is in with one phrase', () => {
    const onChange = vi.fn();
    const onInsert = vi.fn();
    renderBlanks(joinBlanks(['red', 'old']), onChange, onInsert);
    const mics = () => screen.getAllByRole('button', { name: 'Dictate' });
    expect(mics()).toHaveLength(1);
    expect(mics()[0].getAttribute('data-size')).toBe('compact');
    expect(hook.options?.singlePhrase).toBe(true);

    fireEvent.focus(screen.getByLabelText('Blank 2'));
    expect(mics()).toHaveLength(1);
    const seen: unknown[] = [];
    document.addEventListener(DICTATION_EVENT, (e) =>
      seen.push((e as CustomEvent).detail)
    );
    act(() => hook.options?.onCommit(' Blue whale.'));
    expect(onInsert).toHaveBeenCalledWith('Blue whale');
    expect(onChange).toHaveBeenCalledWith(joinBlanks(['red', 'Blue whale']));
    expect(seen).toEqual([{ phase: 'after', chars: 10 }]);
  });

  it('ignores a phrase that is only punctuation', () => {
    const onChange = vi.fn();
    renderBlanks('', onChange, vi.fn());
    act(() => hook.options?.onCommit(' .'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
