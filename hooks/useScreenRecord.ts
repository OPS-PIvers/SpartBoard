import { useState, useRef, useCallback, useEffect } from 'react';

interface ScreenRecordOptions {
  onSuccess?: (blob: Blob) => void;
  onError?: (error: Error) => void;
}

/**
 * Manages screen capture recording via the MediaRecorder API.
 *
 * Note: `options.onSuccess` is NOT guaranteed to fire if the component
 * unmounts while recording is active. The cleanup effect nulls `onstop`
 * before stopping so a stale blob is never delivered to an unmounted
 * consumer — callers should treat this as a best-effort callback.
 */
export const useScreenRecord = (options: ScreenRecordOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Render-body ref sync: callbacks are stored in refs so startRecording's
  // useCallback dep array can omit `options` entirely, making startRecording
  // unconditionally stable regardless of callback identity changes.
  const onSuccessRef = useRef(options.onSuccess);
  // eslint-disable-next-line react-hooks/refs -- intentional render-body ref sync (CLAUDE.md pattern)
  onSuccessRef.current = options.onSuccess;
  const onErrorRef = useRef(options.onError);
  // eslint-disable-next-line react-hooks/refs -- intentional render-body ref sync (CLAUDE.md pattern)
  onErrorRef.current = options.onError;

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    )
      return;
    try {
      setError(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
        },
        audio: true,
      });

      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported(
        'video/webm;codecs=vp9,opus'
      )
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        // Always stop this recorder's stream tracks. Each startRecording()
        // call closes over its own `stream` reference, so stopping is safe
        // unconditionally — even when a rapid Stop → Start means
        // mediaRecorderRef.current has already advanced to recorder2.
        stream.getTracks().forEach((track) => track.stop());

        // Guard against a stale onstop corrupting recorder2's shared mutable
        // refs (chunksRef, isRecording state, streamRef).
        if (mediaRecorderRef.current !== recorder) return;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onSuccessRef.current?.(blob);
        chunksRef.current = [];
        setIsRecording(false);
        setDuration(0);
        streamRef.current = null;
      };

      mediaRecorderRef.current = recorder;

      // Handle user stopping share via browser UI. Placed after
      // mediaRecorderRef.current is assigned so the identity check guards
      // against stale-stream events on rapid unmount/remount.
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (mediaRecorderRef.current === recorder) stopRecording();
        };
      }

      recorder.start();
      setIsRecording(true);

      // Start duration timer
      setDuration(0);
      timerRef.current = window.setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to start recording');
      setError(error);
      onErrorRef.current?.(error);
      console.error('Screen recording failed:', error);
    }
  }, [stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current) {
        // Null onstop before stopping so the async callback never delivers
        // a stale blob to an abandoned consumer.
        mediaRecorderRef.current.onstop = null;
        // Stop directly here so the recorder reaches inactive even when no
        // video track was wired (i.e. onended never fires).
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }
      if (streamRef.current) {
        // Null onended before stopping tracks so track.stop() → ended event
        // doesn't trigger the stopRecording() side-effect chain during cleanup.
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack) videoTrack.onended = null;
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    isRecording,
    duration,
    error,
    startRecording,
    stopRecording,
  };
};
