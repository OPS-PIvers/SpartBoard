import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SPEECH_TO_TEXT_SETTINGS } from '@/config/speechToText';
import {
  resetSpeechToTextSettingsCache,
  useSpeechToTextSettings,
} from './useSpeechToTextSettings';

const mocks = vi.hoisted(() => ({
  call: vi.fn<(request: unknown) => Promise<{ data: unknown }>>(),
  names: [] as string[],
}));

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => {
    mocks.names.push(name);
    return mocks.call;
  },
}));

beforeEach(() => {
  resetSpeechToTextSettingsCache();
  mocks.call.mockReset();
  mocks.names.length = 0;
});

describe('useSpeechToTextSettings', () => {
  it('asks nothing without an assignment', () => {
    const { result } = renderHook(() => useSpeechToTextSettings(undefined));
    expect(result.current).toEqual(DEFAULT_SPEECH_TO_TEXT_SETTINGS);
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('asks the server once per assignment and maps the answer', async () => {
    mocks.call.mockResolvedValue({
      data: { transcription: true, tidyUp: true },
    });
    const first = renderHook(() => useSpeechToTextSettings('a1'));
    expect(first.result.current.engine).toBe('browser');
    await waitFor(() => expect(first.result.current.engine).toBe('hybrid'));
    expect(first.result.current.tidyUp).toBe(true);
    expect(mocks.names).toEqual(['getSpeechToTextAccessV1']);
    expect(mocks.call).toHaveBeenCalledWith({ assignmentId: 'a1' });

    const second = renderHook(() => useSpeechToTextSettings('a1'));
    expect(second.result.current.engine).toBe('hybrid');
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });

  it('asks again for another assignment and keeps the answers apart', async () => {
    mocks.call.mockImplementation((request) =>
      Promise.resolve({
        data: {
          transcription: false,
          tidyUp: JSON.stringify(request).includes('a2'),
        },
      })
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSpeechToTextSettings(id),
      { initialProps: { id: 'a1' } }
    );
    await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));
    expect(result.current.tidyUp).toBe(false);
    rerender({ id: 'a2' });
    await waitFor(() => expect(result.current.tidyUp).toBe(true));
    expect(result.current.engine).toBe('browser');
    expect(mocks.call).toHaveBeenCalledTimes(2);
  });

  it('turns both extras off on an error or a malformed answer', async () => {
    mocks.call.mockRejectedValue(new Error('permission-denied'));
    const denied = renderHook(() => useSpeechToTextSettings('a1'));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));
    expect(denied.result.current).toEqual(DEFAULT_SPEECH_TO_TEXT_SETTINGS);

    mocks.call.mockResolvedValue({ data: { transcription: 'yes' } });
    const odd = renderHook(() => useSpeechToTextSettings('a2'));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(2));
    expect(odd.result.current).toEqual(DEFAULT_SPEECH_TO_TEXT_SETTINGS);
  });
});
