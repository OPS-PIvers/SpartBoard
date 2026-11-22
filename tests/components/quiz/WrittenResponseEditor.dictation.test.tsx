import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type {
  DictationController,
  UseDictationOptions,
} from '@/utils/speechToText/types';
import { DICTATION_EVENT } from '@/utils/inputSignals';

const hook = vi.hoisted(() => ({
  options: null as UseDictationOptions | null,
  interim: '',
  supported: true,
}));

vi.mock('@/hooks/useDictation', () => ({
  useDictation: (options: UseDictationOptions): DictationController => {
    hook.options = options;
    return {
      supported: hook.supported && options.enabled,
      status: 'idle',
      error: null,
      interim: hook.interim,
      language: options.languages[0] ?? 'en',
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

import { WrittenResponseEditor } from '@/components/quiz/WrittenResponseEditor';

const getEditor = (): HTMLElement =>
  screen.getByRole('textbox', { name: /your response/i });
const commit = (text: string) => act(() => hook.options?.onCommit(text));
const last = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.at(-1)?.[0] as string;

beforeEach(() => {
  hook.options = null;
  hook.interim = '';
  hook.supported = true;
});

describe('WrittenResponseEditor dictation', () => {
  it('stays inert and shows no Dictate button without the prop', () => {
    render(
      <WrittenResponseEditor value="" onChange={vi.fn()} questionKey="q1" />
    );
    expect(hook.options?.enabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull();
  });

  it('hides the Dictate button where the browser cannot recognise speech', () => {
    hook.supported = false;
    render(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="q1"
        dictation={{ languages: ['en'] }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull();
  });

  it('inserts dictated text at the end and reports it through onChange', () => {
    const onChange = vi.fn();
    const order: string[] = [];
    onChange.mockImplementation(() => order.push('change'));
    render(
      <WrittenResponseEditor
        value="<p>Plants need light.</p>"
        onChange={onChange}
        questionKey="q1"
        dictation={{
          languages: ['en', 'es'],
          onInsert: (text) => order.push(`insert:${text}`),
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'Dictate' })).toBeTruthy();
    expect(hook.options?.languages).toEqual(['en', 'es']);
    expect(hook.options?.textBefore?.()).toBe('Plants need light.');
    commit(' They also need water.');
    expect(getEditor().textContent).toBe(
      'Plants need light. They also need water.'
    );
    expect(last(onChange)).toBe(
      '<p>Plants need light. They also need water.</p>'
    );
    expect(order).toEqual(['insert: They also need water.', 'change']);
  });

  it('inserts at the caret the student left', () => {
    const onChange = vi.fn();
    render(
      <WrittenResponseEditor
        value="<p>Hello world</p>"
        onChange={onChange}
        questionKey="q1"
        dictation={{ languages: ['en'] }}
      />
    );
    const text = getEditor().querySelector('p')?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 5);
    range.collapse(true);
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(hook.options?.textBefore?.()).toBe('Hello');
    commit(' big');
    expect(getEditor().textContent).toBe('Hello big world');
  });

  it('lets dictated text in when copy and paste are blocked', () => {
    const onChange = vi.fn();
    const allowInsert = vi.fn(() => false);
    render(
      <WrittenResponseEditor
        value=""
        onChange={onChange}
        questionKey="q1"
        blockClipboard
        allowInsert={allowInsert}
        dictation={{ languages: ['en'] }}
      />
    );
    const editor = getEditor();
    const fired: string[] = [];
    for (const type of ['paste', 'drop', 'beforeinput', 'input'])
      editor.addEventListener(type, () => fired.push(type));
    commit('Spoken answer.');
    expect(last(onChange)).toBe('<p>Spoken answer.</p>');
    expect(allowInsert).not.toHaveBeenCalled();
    expect(fired).toEqual([]);
  });

  it('turns a spoken new line into a line break', () => {
    const onChange = vi.fn();
    render(
      <WrittenResponseEditor
        value=""
        onChange={onChange}
        questionKey="q1"
        dictation={{ languages: ['en'] }}
      />
    );
    commit('One.\nTwo.');
    expect(last(onChange)).toBe('<p>One.<br>Two.</p>');
  });

  it('shows words in progress without ever sending them to onChange', () => {
    const onChange = vi.fn();
    hook.interim = 'they also need';
    render(
      <WrittenResponseEditor
        value="<p>Plants need light.</p>"
        onChange={onChange}
        questionKey="q1"
        dictation={{ languages: ['en'] }}
      />
    );
    expect(screen.getByTestId('dictation-interim').textContent).toBe(
      'they also need'
    );
    expect(getEditor().textContent).toBe('Plants need light.');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.input(getEditor());
    expect(last(onChange)).toBe('<p>Plants need light.</p>');
  });

  it('undoes the last dictated passage while it is still there', () => {
    const onChange = vi.fn();
    render(
      <WrittenResponseEditor
        value="<p>Start.</p>"
        onChange={onChange}
        questionKey="q1"
        dictation={{ languages: ['en'] }}
      />
    );
    commit(' First.');
    commit(' Second.');
    act(() => hook.options?.onUndo?.(' Second.'));
    expect(last(onChange)).toBe('<p>Start. First.</p>');
    // The student rewrote the first passage, so there is nothing left to undo.
    const p = getEditor().querySelector('p') as HTMLElement;
    p.textContent = 'Rewritten.';
    fireEvent.input(getEditor());
    const calls = onChange.mock.calls.length;
    act(() => hook.options?.onUndo?.(' First.'));
    expect(onChange.mock.calls.length).toBe(calls);
    expect(getEditor().textContent).toBe('Rewritten.');
  });

  it('announces the edit to the input-signal recorder, before and after', () => {
    render(
      <WrittenResponseEditor
        value=""
        onChange={vi.fn()}
        questionKey="q1"
        dictation={{ languages: ['en'] }}
      />
    );
    const seen: unknown[] = [];
    document.addEventListener(DICTATION_EVENT, (e) =>
      seen.push((e as CustomEvent).detail)
    );
    commit('Hi there.');
    expect(seen).toEqual([
      { phase: 'before', chars: 0 },
      { phase: 'after', chars: 9 },
    ]);
  });

  it('ignores dictation while the editor is locked', () => {
    const onChange = vi.fn();
    render(
      <WrittenResponseEditor
        value="<p>Done.</p>"
        onChange={onChange}
        questionKey="q1"
        disabled
        dictation={{ languages: ['en'] }}
      />
    );
    expect(hook.options?.enabled).toBe(false);
    commit(' More.');
    expect(getEditor().textContent).toBe('Done.');
    expect(onChange).not.toHaveBeenCalled();
  });
});
