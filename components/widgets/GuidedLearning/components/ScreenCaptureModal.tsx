/**
 * ScreenCaptureModal — the Guided Learning "capture studio".
 *
 * Three ways to turn a real on-screen workflow into walkthrough slides
 * without leaving the editor:
 *   - Snap frames: share a screen/window/tab, then snap a still per step
 *     of the workflow. Each snap becomes a slide immediately, so a teacher
 *     can click through a website and capture every state in one pass.
 *   - Record screen: capture the workflow as a WebM screen recording and
 *     add it as a single video slide.
 *   - From a video file: load a local MP4/WebM, scrub to any moment and
 *     extract it as an image slide — or add the whole clip as a video slide.
 *
 * All output funnels through `onAddMedia`, which uploads via the editor
 * state's normal slide pipeline (compression, progress, kinds tracking).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Circle,
  Film,
  Loader2,
  MonitorUp,
  Square,
  Upload,
  X,
} from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import type { GuidedLearningMediaKind } from '@/utils/guidedLearningMedia';

export type CaptureMode = 'snap' | 'record' | 'video-file';

interface Props {
  mode: CaptureMode;
  onAddMedia: (
    blob: Blob,
    kind: GuidedLearningMediaKind,
    baseName: string
  ) => Promise<void>;
  onClose: () => void;
}

const MODE_TITLES: Record<CaptureMode, string> = {
  snap: 'Snap screen frames',
  record: 'Record your screen',
  'video-file': 'Slides from a video',
};

const MODE_HINTS: Record<CaptureMode, string> = {
  snap: 'Share a window or tab, walk through your workflow, and snap a frame for each step. Every snap becomes a slide.',
  record:
    'Share a window or tab and record the workflow. The recording is added as a single video slide.',
  'video-file':
    'Open a video file, scrub to a moment, and extract it as an image slide — or add the whole clip as a video slide.',
};

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Draw the current frame of a <video> element to a PNG blob. */
async function grabFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w === 0 || h === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export const ScreenCaptureModal: React.FC<Props> = ({
  mode,
  onAddMedia,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileUrlRef = useRef<string | null>(null);

  const [sharing, setSharing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [error, setError] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [snapFlash, setSnapFlash] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSharing(false);
  }, []);

  // Tear down screen share / recording / object URLs when the modal closes.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    };
  }, []);

  // `onClose` is typically an inline lambda (`() => setCaptureMode(null)`),
  // so it gets a fresh identity on every parent render — including each
  // uploadProgress tick while the modal is open. Mirror it into a ref and
  // read that inside the handler so the keydown listener below stays stable
  // instead of tearing down/re-adding on every update.
  const onCloseRef = useRef(onClose);
  // Keep the ref in sync with the prop in the render body (per repo convention)
  // rather than in an effect, so the keydown handler never reads a stale closure.
  onCloseRef.current = onClose;

  // Escape closes the modal (standard modal affordance). Skipped while a
  // recording is in flight so a stray Escape can't silently discard it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || recording) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording]);

  // Recording duration ticker.
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(
      () => setRecordSeconds((prev) => prev + 1),
      1000
    );
    return () => window.clearInterval(id);
  }, [recording]);

  const startShare = useCallback(async () => {
    setError('');
    // getDisplayMedia is absent in insecure contexts (plain HTTP) and some
    // embedded/mobile browsers — fail with a message instead of a TypeError.
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('Screen sharing is not supported in this browser or context.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        // Audio only matters for recordings; harmless for snaps if denied.
        audio: mode === 'record',
      });
      streamRef.current = stream;
      setSharing(true);
      stream.getVideoTracks()[0].onended = () => {
        // User stopped sharing from the browser UI.
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
        stopStream();
      };
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setError(
        'Screen sharing was cancelled or blocked. Allow screen sharing and try again.'
      );
    }
  }, [mode, stopStream]);

  const handleSnap = useCallback(async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await grabFrame(videoRef.current);
      if (!blob) {
        setError('Could not capture a frame — try sharing again.');
        return;
      }
      setSnapFlash(true);
      window.setTimeout(() => setSnapFlash(false), 250);
      await onAddMedia(blob, 'image', `screen-step-${Date.now()}`);
      setAddedCount((prev) => prev + 1);
    } finally {
      setBusy(false);
    }
  }, [busy, onAddMedia]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    setError('');
    if (typeof MediaRecorder === 'undefined') {
      setError('Screen recording is not supported in this browser.');
      return;
    }
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      chunksRef.current = [];
      setRecording(false);
      stopStream();
      if (blob.size === 0) {
        setError('The recording came back empty — try again.');
        return;
      }
      setBusy(true);
      void onAddMedia(blob, 'video', `screen-recording-${Date.now()}`)
        .then(() => setAddedCount((prev) => prev + 1))
        .finally(() => setBusy(false));
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecordSeconds(0);
    setRecording(true);
  }, [onAddMedia, stopStream]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const handleVideoFile = useCallback((file: File) => {
    setError('');
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    setVideoFile(file);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
    }
  }, []);

  const handleAddWholeVideo = useCallback(async () => {
    if (!videoFile || busy) return;
    setBusy(true);
    try {
      await onAddMedia(
        videoFile,
        'video',
        videoFile.name.replace(/\.[^.]+$/, '') || 'video-slide'
      );
      setAddedCount((prev) => prev + 1);
    } finally {
      setBusy(false);
    }
  }, [videoFile, busy, onAddMedia]);

  const showPreview = sharing || videoFile !== null;

  // SSR guard — matches the portal pattern used elsewhere in the editor.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.modalNested }}
      role="dialog"
      aria-modal="true"
      aria-label={MODE_TITLES[mode]}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              {mode === 'snap' ? (
                <Camera className="w-4 h-4 text-brand-blue-primary" />
              ) : mode === 'record' ? (
                <Circle className="w-4 h-4 text-brand-red-primary" />
              ) : (
                <Film className="w-4 h-4 text-brand-blue-primary" />
              )}
              {MODE_TITLES[mode]}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-snug">
              {MODE_HINTS[mode]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close capture"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview area */}
        <div className="relative bg-slate-900 aspect-video shrink min-h-0">
          <video
            ref={videoRef}
            muted={mode !== 'video-file'}
            playsInline
            controls={mode === 'video-file' && videoFile !== null}
            className={`w-full h-full object-contain ${showPreview ? '' : 'hidden'}`}
          />
          {snapFlash && (
            <div className="absolute inset-0 bg-white/80 pointer-events-none" />
          )}
          {recording && (
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 text-white text-xs font-bold rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse motion-reduce:animate-none" />
              REC {formatDuration(recordSeconds)}
            </div>
          )}
          {!showPreview && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
              {mode === 'video-file' ? (
                <>
                  <Film className="w-10 h-10" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-lg text-sm transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Open video file
                  </button>
                  <p className="text-xs">MP4 or WebM</p>
                </>
              ) : (
                <>
                  <MonitorUp className="w-10 h-10" />
                  <button
                    onClick={() => void startShare()}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-lg text-sm transition-colors"
                  >
                    <MonitorUp className="w-4 h-4" />
                    Share your screen
                  </button>
                  <p className="text-xs">
                    Pick the window or tab with your workflow
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleVideoFile(file);
              e.target.value = '';
            }}
          />

          {mode === 'snap' && sharing && (
            <button
              onClick={() => void handleSnap()}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-colors"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              Snap frame
            </button>
          )}

          {mode === 'record' && sharing && !recording && (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2 bg-brand-red-primary hover:bg-brand-red-dark text-white font-bold rounded-lg text-sm transition-colors"
            >
              <Circle className="w-4 h-4 fill-current" />
              Start recording
            </button>
          )}
          {mode === 'record' && recording && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-sm transition-colors"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop &amp; add slide
            </button>
          )}

          {mode === 'video-file' && videoFile && (
            <>
              <button
                onClick={() => {
                  videoRef.current?.pause();
                  void handleSnap();
                }}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-colors"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                Add this frame as a slide
              </button>
              <button
                onClick={() => void handleAddWholeVideo()}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 disabled:opacity-50 text-slate-700 font-bold rounded-lg text-sm transition-colors"
              >
                <Film className="w-4 h-4" />
                Add whole video as a slide
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors px-2 py-2"
              >
                Open a different file
              </button>
            </>
          )}

          {(mode === 'snap' || mode === 'record') && sharing && !recording && (
            <button
              onClick={stopStream}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors px-2 py-2"
            >
              Stop sharing
            </button>
          )}

          <div className="ml-auto flex items-center gap-3">
            {error && (
              <span className="text-xs font-medium text-red-600">{error}</span>
            )}
            {addedCount > 0 && !error && (
              <span className="text-xs font-bold text-emerald-700">
                {addedCount} {addedCount === 1 ? 'slide' : 'slides'} added
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-sm transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
