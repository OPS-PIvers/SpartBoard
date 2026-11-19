import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SPEECH_TO_TEXT_SETTINGS } from '@/config/speechToText';
import {
  resetSpeechToTextSettingsCache,
  useSpeechToTextSettings,
} from './useSpeechToTextSettings';

const mocks = vi.hoisted(() => ({
  getDoc:
    vi.fn<() => Promise<{ exists: () => boolean; data: () => unknown }>>(),
  doc: vi.fn((...path: unknown[]) => path.slice(1).join('/')),
}));

vi.mock('firebase/firestore', () => ({
  getDoc: mocks.getDoc,
  doc: mocks.doc,
}));

const snap = (data: unknown) => ({
  exists: () => data !== undefined,
  data: () => data,
});

beforeEach(() => {
  resetSpeechToTextSettingsCache();
  mocks.getDoc.mockReset();
  mocks.doc.mockClear();
});

describe('useSpeechToTextSettings', () => {
  it('reads nothing while disabled', () => {
    const { result } = renderHook(() => useSpeechToTextSettings(false));
    expect(result.current).toEqual(DEFAULT_SPEECH_TO_TEXT_SETTINGS);
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });

  it('reads the admin doc once for the page and normalises it', async () => {
    mocks.getDoc.mockResolvedValue(snap({ engine: 'hybrid', tidyUp: true }));
    const first = renderHook(() => useSpeechToTextSettings(true));
    expect(first.result.current.engine).toBe('browser');
    await waitFor(() => expect(first.result.current.engine).toBe('hybrid'));
    expect(first.result.current.tidyUp).toBe(true);
    expect(mocks.doc.mock.results[0]?.value).toBe(
      'admin_settings/speech_to_text'
    );

    const second = renderHook(() => useSpeechToTextSettings(true));
    expect(second.result.current.engine).toBe('hybrid');
    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
  });

  it('falls back to everything off when the doc is missing or unreadable', async () => {
    mocks.getDoc.mockResolvedValue(snap(undefined));
    const missing = renderHook(() => useSpeechToTextSettings(true));
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledTimes(1));
    expect(missing.result.current).toEqual(DEFAULT_SPEECH_TO_TEXT_SETTINGS);

    resetSpeechToTextSettingsCache();
    mocks.getDoc.mockRejectedValue(new Error('permission-denied'));
    const denied = renderHook(() => useSpeechToTextSettings(true));
    await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledTimes(2));
    expect(denied.result.current).toEqual(DEFAULT_SPEECH_TO_TEXT_SETTINGS);
  });
});
