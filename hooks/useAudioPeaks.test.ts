import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { computePeaks, useAudioPeaks, SILENCE_RMS } from './useAudioPeaks';
import { getAudioCtx } from '@/utils/timeToolAudio';

vi.mock('@/utils/timeToolAudio', () => ({
  getAudioCtx: vi.fn(),
  resumeAudio: vi.fn(),
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockedGetAudioCtx = vi.mocked(getAudioCtx);

// 1000 samples: tone (0–399), silence (400–599), quieter tone (600–999).
function synthetic(): Float32Array {
  const data = new Float32Array(1000);
  for (let i = 0; i < 400; i++) data[i] = 0.8 * Math.sin(i * 0.5);
  for (let i = 600; i < 1000; i++) data[i] = 0.4 * Math.sin(i * 0.5);
  return data;
}

describe('computePeaks', () => {
  it('produces the requested bucket count', () => {
    const { peaks, silent } = computePeaks([synthetic()], 10);
    expect(peaks).toHaveLength(10);
    expect(silent).toHaveLength(10);
  });

  it('normalizes peaks so the loudest window is 1', () => {
    const { peaks } = computePeaks([synthetic()], 10);
    const max = Math.max(...Array.from(peaks));
    expect(max).toBeCloseTo(1, 5);
    expect(peaks[7]).toBeLessThan(0.6);
    expect(peaks[7]).toBeGreaterThan(0.3);
  });

  it('marks the zero gap as silent and tone windows as speech', () => {
    const { silent } = computePeaks([synthetic()], 10);
    expect(silent.slice(0, 4)).toEqual([false, false, false, false]);
    expect(silent.slice(4, 6)).toEqual([true, true]);
    expect(silent.slice(6)).toEqual([false, false, false, false]);
  });

  it('mixes channels to mono', () => {
    const left = new Float32Array(100).fill(0.5);
    const right = new Float32Array(100).fill(-0.5);
    const { peaks, silent } = computePeaks([left, right], 4);
    expect(Array.from(peaks)).toEqual([0, 0, 0, 0]);
    expect(silent).toEqual([true, true, true, true]);
  });

  it('leaves zeros when the buffer is all silence', () => {
    const { peaks, silent } = computePeaks([new Float32Array(500)], 5);
    expect(Array.from(peaks)).toEqual([0, 0, 0, 0, 0]);
    expect(silent.every(Boolean)).toBe(true);
  });

  it('uses an RMS threshold rather than a peak threshold', () => {
    const data = new Float32Array(100).fill(SILENCE_RMS * 0.5);
    data[10] = 0.1;
    const { silent } = computePeaks([data], 1);
    expect(silent).toEqual([true]);
  });
});

describe('useAudioPeaks', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('is idle without a src', () => {
    const { result } = renderHook(() => useAudioPeaks(null));
    expect(result.current.status).toBe('idle');
    expect(result.current.peaks).toBeNull();
  });

  it('decodes to ready with peaks and silence mask', async () => {
    const decodeAudioData = vi.fn().mockResolvedValue({
      numberOfChannels: 1,
      getChannelData: () => synthetic(),
    });
    mockedGetAudioCtx.mockReturnValue({
      decodeAudioData,
    } as unknown as AudioContext);

    const { result } = renderHook(() => useAudioPeaks('blob:take', 10));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledWith('blob:take');
    expect(result.current.peaks).toHaveLength(10);
    expect(result.current.silent?.slice(4, 6)).toEqual([true, true]);
  });

  it('reports unsupported when decode rejects', async () => {
    mockedGetAudioCtx.mockReturnValue({
      decodeAudioData: vi.fn().mockRejectedValue(new Error('bad codec')),
    } as unknown as AudioContext);

    const { result } = renderHook(() => useAudioPeaks('blob:take'));
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
    expect(result.current.peaks).toBeNull();
  });

  it('reports unsupported when no AudioContext exists', async () => {
    mockedGetAudioCtx.mockReturnValue(null);
    const { result } = renderHook(() => useAudioPeaks('blob:take'));
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });

  it('ignores a stale decode after src changes', async () => {
    let resolveFirst: ((v: unknown) => void) | undefined;
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve({
        arrayBuffer: () =>
          Promise.resolve(new ArrayBuffer(url === 'blob:a' ? 1 : 2)),
      })
    );
    const decodeAudioData = vi.fn((bytes: ArrayBuffer) =>
      bytes.byteLength === 1
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({
            numberOfChannels: 1,
            getChannelData: () => new Float32Array(100),
          })
    );
    mockedGetAudioCtx.mockReturnValue({
      decodeAudioData,
    } as unknown as AudioContext);

    const { result, rerender } = renderHook(
      ({ src }: { src: string }) => useAudioPeaks(src, 4),
      { initialProps: { src: 'blob:a' } }
    );
    rerender({ src: 'blob:b' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    resolveFirst?.({
      numberOfChannels: 1,
      getChannelData: () => synthetic(),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(Array.from(result.current.peaks ?? [])).toEqual([0, 0, 0, 0]);
  });
});
