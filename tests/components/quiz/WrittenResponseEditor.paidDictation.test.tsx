import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type {
  DictationController,
  UseDictationOptions,
} from '@/utils/speechToText/types';
import { DEFAULT_SPEECH_TO_TEXT_SETTINGS } from '@/config/speechToText';
import type { SpeechToTextSettings } from '@/types';
import { resetPaidDictationState } from '@/utils/speechToText/paidCalls';

interface HookMock {
  options: UseDictationOptions | null;
  status: DictationController['status'];
  tidyUp: boolean;
  settingsEnabled: boolean;
  callable: ReturnType<
    typeof vi.fn<(request: unknown) => Promise<{ data: unknown }>>
  >;
}

const hook = vi.hoisted<HookMock>(() => ({
  options: null,
  status: 'idle',
  tidyUp: true,
  settingsEnabled: false,
  callable: vi.fn<(request: unknown) => Promise<{ data: unknown }>>(),
}));

vi.mock('@/hooks/useDictation', () => ({
  useDictation: (options: UseDictationOptions): DictationController => {
    hook.options = options;
    return {
      supported: options.enabled,
      status: hook.status,
      error: null,
      interim: '',
      language: 'es',
      languages: options.languages,
      setLanguage: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      toggle: () => undefined,
    };
  },
}));
vi.mock('@/hooks/useSpeechToTextSettings', () => ({
  useSpeechToTextSettings: (enabled: boolean): SpeechToTextSettings => {
    hook.settingsEnabled = enabled;
    return {
      ...DEFAULT_SPEECH_TO_TEXT_SETTINGS,
      tidyUp: enabled && hook.tidyUp,
    };
  },
}));
vi.mock('@/components/common/dictate/DictateButton', () => ({
  DictateButton: () => <button type="button">Dictate</button>,
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => hook.callable,
}));

import { WrittenResponseEditor } from '@/components/quiz/WrittenResponseEditor';

const getEditor = (): HTMLElement =>
  screen.getByRole('textbox', { name: /your response/i });
const commit = (text: string) => act(() => hook.options?.onCommit(text));
const revise = (previous: string, next: string) =>
  act(() => hook.options?.onRevise?.(previous, next));
const last = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.at(-1)?.[0] as string;
const tidyButton = () => screen.queryByRole('button', { name: 'Tidy up' });

function renderEditor(
  props: {
    value?: string;
    onChange?: (html: string) => void;
    onInsert?: (text: string) => void;
    paid?: boolean;
  } = {}
) {
  return render(
    <WrittenResponseEditor
      value={props.value ?? ''}
      onChange={props.onChange ?? vi.fn()}
      questionKey="q1"
      dictation={{
        languages: ['en', 'es'],
        onInsert: props.onInsert,
        ...(props.paid === false ? {} : { paid: { assignmentId: 'asn-1' } }),
      }}
    />
  );
}

async function tapTidy(): Promise<void> {
  const button = tidyButton();
  if (!button) throw new Error('no Tidy up button');
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  hook.options = null;
  hook.status = 'idle';
  hook.tidyUp = true;
  hook.settingsEnabled = false;
  hook.callable.mockReset();
  resetPaidDictationState();
});

describe('WrittenResponseEditor: paid revision', () => {
  it('hands paid to the hook only when the caller gave it', () => {
    const { unmount } = renderEditor({ paid: false });
    expect(hook.options?.paid).toBeUndefined();
    expect(hook.settingsEnabled).toBe(false);
    unmount();
    renderEditor();
    expect(hook.options?.paid).toEqual({ assignmentId: 'asn-1' });
    expect(hook.settingsEnabled).toBe(true);
  });

  it('replaces an untouched passage in place and announces it first', () => {
    const onChange = vi.fn();
    const order: string[] = [];
    onChange.mockImplementation(() => order.push('change'));
    renderEditor({
      value: '<p>Plants need light.</p>',
      onChange,
      onInsert: (text) => order.push(`insert:${text}`),
    });
    commit(' They also need water');
    commit(' and soil');
    order.length = 0;
    revise(' They also need water', ' They also need water,');
    expect(getEditor().textContent).toBe(
      'Plants need light. They also need water, and soil'
    );
    expect(last(onChange)).toBe(
      '<p>Plants need light. They also need water, and soil</p>'
    );
    expect(order).toEqual(['insert: They also need water,', 'change']);
  });

  it('keeps dictating after the revised text when the caret was at its end', () => {
    renderEditor({ value: '<p>One.</p>' });
    commit(' Too cats');
    revise(' Too cats', ' Two cats.');
    commit(' Three dogs.');
    expect(getEditor().textContent).toBe('One. Two cats. Three dogs.');
  });

  it('does nothing when the student has edited the passage', () => {
    const onChange = vi.fn();
    const onInsert = vi.fn();
    renderEditor({ onChange, onInsert });
    commit('The cat sat');
    const node = getEditor().querySelector('p')?.firstChild as Text;
    node.data = 'The dog sat';
    fireEvent.input(getEditor());
    onChange.mockClear();
    onInsert.mockClear();
    revise('The cat sat', 'The cat sat.');
    expect(getEditor().textContent).toBe('The dog sat');
    expect(onChange).not.toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('does nothing for a passage it never inserted', () => {
    const onChange = vi.fn();
    renderEditor({ value: '<p>Typed by hand</p>', onChange });
    revise('Typed by hand', 'Typed by hand.');
    expect(getEditor().textContent).toBe('Typed by hand');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"undo that" removes the revised text', () => {
    const onChange = vi.fn();
    renderEditor({ value: '<p>One.</p>', onChange });
    commit(' Too cats');
    revise(' Too cats', ' Two cats.');
    act(() => hook.options?.onUndo?.(' Two cats.'));
    expect(getEditor().textContent).toBe('One.');
    expect(last(onChange)).toBe('<p>One.</p>');
  });
});

describe('WrittenResponseEditor: Tidy up', () => {
  it('appears only after dictating, with paid and the admin setting on', () => {
    const { unmount } = renderEditor();
    expect(tidyButton()).toBeNull();
    commit('i went home');
    expect(tidyButton()).not.toBeNull();
    unmount();

    hook.tidyUp = false;
    const off = renderEditor();
    commit('i went home');
    expect(tidyButton()).toBeNull();
    off.unmount();

    hook.tidyUp = true;
    renderEditor({ paid: false });
    commit('i went home');
    expect(tidyButton()).toBeNull();
  });

  it('hides while the student is still dictating', () => {
    hook.status = 'listening';
    renderEditor();
    commit('i went home');
    expect(tidyButton()).toBeNull();
  });

  it('previews the tidied passage and uses it on "Use this", with Undo', async () => {
    hook.callable.mockResolvedValue({
      data: { text: 'I went home. Then I slept.' },
    });
    const onChange = vi.fn();
    const onInsert = vi.fn();
    renderEditor({ value: '<p>Yesterday.</p>', onChange, onInsert });
    commit(' i went home');
    commit(' then i slept');
    await tapTidy();
    expect(hook.callable).toHaveBeenCalledWith({
      assignmentId: 'asn-1',
      text: 'i went home then i slept',
      language: 'es',
    });
    expect(screen.getByTestId('tidy-before').textContent).toBe(
      'i went home then i slept'
    );
    expect(screen.getByTestId('tidy-after').textContent).toBe(
      'I went home. Then I slept.'
    );
    // Nothing changes until the student picks.
    expect(getEditor().textContent).toBe('Yesterday. i went home then i slept');

    onInsert.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
    expect(getEditor().textContent).toBe(
      'Yesterday. I went home. Then I slept.'
    );
    expect(onInsert).toHaveBeenCalledWith(' I went home. Then I slept.');
    expect(last(onChange)).toBe('<p>Yesterday. I went home. Then I slept.</p>');
    expect(screen.queryByTestId('tidy-after')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(getEditor().textContent).toBe('Yesterday. i went home then i slept');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('leaves the text alone on "Keep mine"', async () => {
    hook.callable.mockResolvedValue({ data: { text: 'I went home.' } });
    const onChange = vi.fn();
    renderEditor({ onChange });
    commit('i went home');
    onChange.mockClear();
    await tapTidy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(getEditor().textContent).toBe('i went home');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tidy-after')).toBeNull();
    expect(tidyButton()).not.toBeNull();
  });

  it('sends only the newest run when the student typed in between', async () => {
    hook.callable.mockResolvedValue({ data: { text: 'Then I slept.' } });
    renderEditor();
    commit('i went home');
    const paragraph = getEditor().querySelector('p') as HTMLElement;
    paragraph.append(document.createTextNode(' (typed)'));
    fireEvent.input(getEditor());
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });
    commit(' then i slept');
    await tapTidy();
    expect(hook.callable).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'then i slept' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
    expect(getEditor().textContent).toBe('i went home (typed) Then I slept.');
  });

  it('does not use a preview once the passage was edited', async () => {
    hook.callable.mockResolvedValue({ data: { text: 'I went home.' } });
    const onChange = vi.fn();
    renderEditor({ onChange });
    commit('i went home');
    await tapTidy();
    const node = getEditor().querySelector('p')?.firstChild as Text;
    node.data = 'i went to school';
    fireEvent.input(getEditor());
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
    expect(getEditor().textContent).toBe('i went to school');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['a cap fallback', () => Promise.resolve({ data: { fallback: 'cap' } })],
    ['an error', () => Promise.reject(new Error('unavailable'))],
  ])('quietly hides the button after %s', async (_name, answer) => {
    hook.callable.mockImplementation(answer);
    const first = renderEditor();
    commit('i went home');
    await tapTidy();
    expect(tidyButton()).toBeNull();
    expect(screen.queryByTestId('tidy-after')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(getEditor().textContent).toBe('i went home');
    first.unmount();

    // Gone for the rest of the page, in every box.
    renderEditor();
    commit('another answer');
    expect(tidyButton()).toBeNull();
  });
});
