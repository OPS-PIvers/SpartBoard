import { useEffect, useState } from 'react';
import { getAudioCtx } from '@/utils/timeToolAudio';
import { logError } from '@/utils/logError';

export const SILENCE_RMS = 0.02;

export type AudioPeaksStatus = 'idle' | 'loading' | 'ready' | 'unsupported';

export interface AudioPeaksResult {
  peaks: Float32Array | null;
  silent: boolean[] | null;
  status: AudioPeaksStatus;
}

// Mixes channels to mono and folds samples into `buckets` peak/RMS windows.
export function computePeaks(
  channelData: Float32Array[],
  buckets: number
): { peaks: Float32Array; silent: boolean[] } {
  const safeBuckets = Math.max(0, Math.floor(buckets));
  const peaks = new Float32Array(safeBuckets);
  const silent: boolean[] = new Array<boolean>(safeBuckets).fill(true);
  const length = channelData[0]?.length ?? 0;
  const channels = channelData.length;
  if (length === 0 || channels === 0 || safeBuckets === 0) {
    return { peaks, silent };
  }

  const windowSize = length / safeBuckets;
  let globalMax = 0;
  for (let b = 0; b < safeBuckets; b++) {
    const start = Math.floor(b * windowSize);
    const end = Math.min(
      length,
      Math.max(start + 1, Math.floor((b + 1) * windowSize))
    );
    let peak = 0;
    let sumSq = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      let mono = 0;
      for (let c = 0; c < channels; c++) mono += channelData[c][i] ?? 0;
      mono /= channels;
      const abs = Math.abs(mono);
      if (abs > peak) peak = abs;
      sumSq += mono * mono;
      count++;
    }
    peaks[b] = peak;
    if (peak > globalMax) globalMax = peak;
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    silent[b] = rms < SILENCE_RMS;
  }
  if (globalMax > 0) {
    for (let b = 0; b < safeBuckets; b++) peaks[b] /= globalMax;
  }
  return { peaks, silent };
}

export function useAudioPeaks(
  src: string | null,
  buckets = 400
): AudioPeaksResult {
  const [decoded, setDecoded] = useState<
    (AudioPeaksResult & { key: string }) | null
  >(null);
  const key = `${src ?? ''}|${buckets}`;

  useEffect(() => {
    if (!src) return;
    let cancelled = false;

    const run = async () => {
      const ctx = getAudioCtx();
      if (!ctx) throw new Error('AudioContext unavailable');
      const res = await fetch(src);
      const bytes = await res.arrayBuffer();
      if (cancelled) return;
      const buffer = await ctx.decodeAudioData(bytes);
      if (cancelled) return;
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        channels.push(buffer.getChannelData(c));
      }
      const { peaks, silent } = computePeaks(channels, buckets);
      if (!cancelled) setDecoded({ key, peaks, silent, status: 'ready' });
    };

    run().catch((err: unknown) => {
      if (cancelled) return;
      logError('useAudioPeaks.decode', err);
      setDecoded({ key, peaks: null, silent: null, status: 'unsupported' });
    });

    return () => {
      cancelled = true;
    };
  }, [src, buckets, key]);

  if (!src) return { peaks: null, silent: null, status: 'idle' };
  if (decoded && decoded.key === key) {
    return {
      peaks: decoded.peaks,
      silent: decoded.silent,
      status: decoded.status,
    };
  }
  return { peaks: null, silent: null, status: 'loading' };
}
