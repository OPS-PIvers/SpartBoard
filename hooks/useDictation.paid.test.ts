import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeMediaRecorder,
  installFakeMediaRecorder,
} from '@/utils/speechToText/fakeMediaRecorder';
import {
  FakeRecognition,
  installFakeRecognition,
} from '@/utils/speechToText/fakeRecognition';
import { resetPaidDictationState } from '@/utils/speechToText/paidCalls';
import type { UseDictationOptions } from '@/utils/speechToText/types';
import { DEFAULT_SPEECH_TO_TEXT_SETTINGS } from '@/config/speechToText';
import type { SpeechToTextSettings } from '@/types';
import { resetDictationPreference, useDictation } from './useDictation';

const mocks = vi.hoisted(() => ({
  engine: 'browser',
  settingsEnabled: [] as boolean[],
  callable: vi.fn<(request: unknown) => Promise<{ data: unknown }>>(),
}));

vi.mock('./useSpeechToTextSettings', () => ({
  useSpeechToTextSettings: (enabled: boolean): SpeechToTextSettings => {
    mocks.settingsEnabled.push(enabled);
    return {
      ...DEFAULT_SPEECH_TO_TEXT_SETTINGS,
      engine: enabled ? mocks.engine : 'browser',
    };
  },
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mocks.callable,
}));

const rec = () => FakeRecognition.current;
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

const setup = (overrides: Partial<UseDictationOptions> = {}) => {
  const onCommit = vi.fn();
  const onUndo = vi.fn();
  const onRevise = vi.fn();
  const view = renderHook(() =>
    useDictation({
      enabled: true,
      languages: ['en'],
      onCommit,
      onUndo,
      onRevise,
      paid: { assignmentId: 'asn-1' },
      ...overrides,
    })
  );
  return { ...view, onCommit, onUndo, onRevise };
};

async function say(text: string): Promise<void> {
  act(() => {
    rec().emit([[text, false]]);
    rec().final(text);
  });
  await flush();
}

describe('useDictation with the paid engine', () => {
  let uninstallRecognition: () => void;
  let uninstallRecorder: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.engine = 'hybrid';
    mocks.settingsEnabled = [];
    mocks.callable.mockReset();
    resetDictationPreference();
    resetPaidDictationState();
    uninstallRecognition = installFakeRecognition();
    ({ uninstall: uninstallRecorder } = installFakeMediaRecorder());
  });

  afterEach(() => {
    uninstallRecorder();
    uninstallRecognition();
    vi.useRealTimers();
  });

  it('reads the settings only when paid is present', () => {
    setup({ paid: undefined });
    expect(mocks.settingsEnabled.every((enabled) => !enabled)).toBe(true);
    mocks.settingsEnabled = [];
    setup();
    expect(mocks.settingsEnabled.every((enabled) => enabled)).toBe(true);
  });

  it('commits the browser text, then revises it to fit what was there', async () => {
    mocks.callable.mockResolvedValue({ data: { text: 'the cat sat down.' } });
    const { result, onCommit, onRevise } = setup({
      textBefore: () => 'Look.',
    });
    act(() => result.current.start());
    await flush();
    await say('the cat sat');
    expect(onCommit).toHaveBeenCalledWith(' The cat sat');
    expect(mocks.callable).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentId: 'asn-1', language: 'en' })
    );
    expect(onRevise).toHaveBeenCalledTimes(1);
    expect(onRevise).toHaveBeenCalledWith(' The cat sat', ' The cat sat down.');
  });

  it('leaves the model punctuation alone instead of applying spoken rules', async () => {
    mocks.callable.mockResolvedValue({
      data: { text: 'the class period was long.' },
    });
    const { result, onRevise } = setup();
    act(() => result.current.start());
    await flush();
    await say('the class period was long');
    expect(onRevise).toHaveBeenCalledWith(
      'The class period was long',
      'The class period was long.'
    );
  });

  it('does not revise when the transcript matches', async () => {
    mocks.callable.mockResolvedValue({ data: { text: 'the cat sat' } });
    const { result, onCommit, onRevise } = setup();
    act(() => result.current.start());
    await flush();
    await say('the cat sat');
    expect(onCommit).toHaveBeenCalledWith('The cat sat');
    expect(onRevise).not.toHaveBeenCalled();
  });

  it('does not revise a phrase the student undid', async () => {
    let answer: (value: { data: unknown }) => void = () => undefined;
    mocks.callable.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    mocks.callable.mockResolvedValue({ data: { text: 'Undo that.' } });
    const { result, onUndo, onRevise } = setup();
    act(() => result.current.start());
    await flush();
    await say('the cat sat');
    await say('undo that');
    expect(onUndo).toHaveBeenCalledWith('The cat sat');
    answer({ data: { text: 'The cat sat.' } });
    await flush();
    expect(onRevise).not.toHaveBeenCalled();
  });

  it('applies a revision that arrives after listening stopped', async () => {
    mocks.callable.mockResolvedValue({ data: { text: 'Blue whale.' } });
    const { result, onCommit, onRevise } = setup({ singlePhrase: true });
    act(() => result.current.start());
    await flush();
    act(() => {
      rec().emit([['blue wail', false]]);
      rec().final('blue wail');
    });
    expect(result.current.status).toBe('idle');
    expect(onCommit).toHaveBeenCalledWith('Blue wail');
    await flush();
    expect(onRevise).toHaveBeenCalledWith('Blue wail', 'Blue whale.');
  });

  it('stays on the free engine after a fallback, with no error shown', async () => {
    mocks.callable.mockResolvedValue({ data: { fallback: 'off' } });
    const { result, onCommit, onRevise } = setup();
    act(() => result.current.start());
    await flush();
    await say('the cat sat');
    await say('on the mat');
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onRevise).not.toHaveBeenCalled();
    expect(mocks.callable).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('listening');
    expect(FakeMediaRecorder.live).toHaveLength(0);
  });

  it('records nothing when the admin setting is off', async () => {
    mocks.engine = 'browser';
    const { result, onCommit } = setup();
    act(() => result.current.start());
    await flush();
    await say('the cat sat');
    expect(onCommit).toHaveBeenCalledWith('The cat sat');
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it('records nothing without paid, even with the setting on', async () => {
    const { result, onCommit } = setup({ paid: undefined });
    act(() => result.current.start());
    await flush();
    await say('the cat sat');
    expect(onCommit).toHaveBeenCalledWith('The cat sat');
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(mocks.callable).not.toHaveBeenCalled();
  });
});
