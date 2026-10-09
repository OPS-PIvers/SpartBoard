import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBlob, ref } from 'firebase/storage';
import { Download, Loader2, Pause, Play, Trash2 } from 'lucide-react';
import { storage } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { formatRecordingClock } from './recordingTime';
import { tourAttr } from '@/config/tourAnchors';

export interface RecordingPart {
  path: string;
  durationMs: number;
}

interface RecordingPlayerProps {
  parts: RecordingPart[];
  /** Who recorded it, when, and any status such as "Interrupted". */
  meta: string;
  downloadName: string;
  onDelete?: () => void;
}

/** Plays a recording's parts back to back on one timeline. */
export const RecordingPlayer: React.FC<RecordingPlayerProps> = ({
  parts,
  meta,
  downloadName,
  onDelete,
}) => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [urls, setUrls] = useState<string[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [partIndex, setPartIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const urlsRef = useRef<string[]>([]);
  const pendingSeekRef = useRef<number | null>(null);

  const totalMs = parts.reduce((sum, p) => sum + p.durationMs, 0);
  const offsets = parts.map((_, i) =>
    parts.slice(0, i).reduce((sum, p) => sum + p.durationMs, 0)
  );

  useEffect(
    () => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)),
    []
  );

  const loadBlobs = async (): Promise<Blob[] | null> => {
    try {
      return await Promise.all(parts.map((p) => getBlob(ref(storage, p.path))));
    } catch (err) {
      logError('RecordingPlayer.load', err);
      setStatus('error');
      return null;
    }
  };

  const ensureLoaded = async (): Promise<string[] | null> => {
    if (urls) return urls;
    setStatus('loading');
    const blobs = await loadBlobs();
    if (!blobs) return null;
    const next = blobs.map((blob) => URL.createObjectURL(blob));
    urlsRef.current = next;
    setUrls(next);
    setStatus('idle');
    return next;
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    const loaded = await ensureLoaded();
    if (!loaded) return;
    if (!audio.src) audio.src = loaded[partIndex];
    void audio.play();
  };

  const seekTo = async (ms: number) => {
    const loaded = await ensureLoaded();
    const audio = audioRef.current;
    if (!loaded || !audio) return;
    let index = parts.length - 1;
    while (index > 0 && offsets[index] > ms) index -= 1;
    const within = (ms - offsets[index]) / 1000;
    setPositionMs(ms);
    if (index !== partIndex || !audio.src) {
      setPartIndex(index);
      pendingSeekRef.current = within;
      audio.src = loaded[index];
      if (playing) void audio.play();
    } else {
      audio.currentTime = within;
    }
  };

  const handleEnded = () => {
    const next = partIndex + 1;
    const audio = audioRef.current;
    if (!urls || !audio || next >= urls.length) {
      setPlaying(false);
      setPartIndex(0);
      setPositionMs(0);
      if (audio && urls) audio.src = urls[0];
      return;
    }
    setPartIndex(next);
    audio.src = urls[next];
    void audio.play();
  };

  const handleDownload = async () => {
    const blobs = await loadBlobs();
    if (!blobs) return;
    blobs.forEach((blob, i) => {
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download =
        blobs.length > 1
          ? `${downloadName} (${i + 1}).webm`
          : `${downloadName}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    });
  };

  const label = playing
    ? t('plcDashboard.notes.recording.pauseAudio', { defaultValue: 'Pause' })
    : t('plcDashboard.notes.recording.play', { defaultValue: 'Play' });

  return (
    <div className="flex items-center gap-2 py-1">
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onLoadedMetadata={(e) => {
          if (pendingSeekRef.current === null) return;
          e.currentTarget.currentTime = pendingSeekRef.current;
          pendingSeekRef.current = null;
        }}
        onTimeUpdate={(e) =>
          setPositionMs(offsets[partIndex] + e.currentTarget.currentTime * 1000)
        }
        className="hidden"
      />
      <button
        {...tourAttr('plc-recording.play')}
        type="button"
        onClick={() => void togglePlay()}
        disabled={status === 'loading'}
        aria-label={label}
        title={label}
        className="shrink-0 p-1 rounded-md text-brand-blue-primary hover:bg-brand-blue-lighter/60 disabled:opacity-60 transition-colors"
      >
        {status === 'loading' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : playing ? (
          <Pause className="w-3.5 h-3.5" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
      </button>
      <span className="shrink-0 w-9 text-right text-xxs tabular-nums text-slate-500">
        {formatRecordingClock(positionMs)}
      </span>
      <input
        {...tourAttr('plc-recording.seek')}
        type="range"
        min={0}
        max={Math.max(1, totalMs)}
        step={1000}
        value={Math.min(positionMs, totalMs)}
        onChange={(e) => void seekTo(Number(e.target.value))}
        aria-label={t('plcDashboard.notes.recording.seek', {
          defaultValue: 'Position',
        })}
        className="flex-1 min-w-0 h-1 accent-brand-blue-primary cursor-pointer"
      />
      <span className="shrink-0 text-xxs tabular-nums text-slate-500">
        {formatRecordingClock(totalMs)}
      </span>
      <span className="shrink-0 max-w-[12rem] truncate text-xxs text-slate-500">
        {status === 'error'
          ? t('plcDashboard.notes.recording.loadError', {
              defaultValue: "Couldn't load audio",
            })
          : meta}
      </span>
      <button
        {...tourAttr('plc-recording.download')}
        type="button"
        onClick={() => void handleDownload()}
        aria-label={t('plcDashboard.notes.recording.download', {
          defaultValue: 'Download',
        })}
        title={t('plcDashboard.notes.recording.download', {
          defaultValue: 'Download',
        })}
        className="shrink-0 p-1 text-slate-400 hover:text-brand-blue-primary rounded transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
      {onDelete && (
        <button
          {...tourAttr('plc-recording.delete')}
          type="button"
          onClick={onDelete}
          aria-label={t('plcDashboard.notes.recording.delete', {
            defaultValue: 'Delete recording',
          })}
          title={t('plcDashboard.notes.recording.delete', {
            defaultValue: 'Delete recording',
          })}
          className="shrink-0 p-1 text-slate-300 hover:text-red-500 rounded transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
