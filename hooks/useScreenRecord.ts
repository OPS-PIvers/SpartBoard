import { useState, useRef, useCallback, useEffect } from 'react';

interface ScreenRecordOptions {
  onSuccess?: (blob: Blob) => void;
  onError?: (error: Error) => void;
}

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

      // Handle user stopping share via browser UI
      stream.getVideoTracks()[0].onended = () => {
        stopRecording();
      };

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
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onSuccessRef.current?.(blob);
        chunksRef.current = [];
        setIsRecording(false);
        setDuration(0);

        // Clean up stream tracks
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
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
      if (streamRef.current) {
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
