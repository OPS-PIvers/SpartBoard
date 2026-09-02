/**
 * Lazy fetch of one archived audio take for the student who recorded it
 * (Brief 3.6). The bytes come back base64 from `getQuizArtifactPlaybackUrl`
 * and become an object URL — the Drive file is never public and no access
 * token reaches the browser.
 *
 * Nothing is requested until the student presses play: a results screen with
 * six recording questions must not make six Drive calls for takes nobody
 * listens to.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { ArtifactSlot } from '@/types';

export type PlaybackUnavailableReason =
  | 'archiving'
  | 'failed'
  | 'deleted'
  | 'no-recording'
  | 'too-large';

export interface PlaybackRequest {
  sessionId: string;
  responseKey: string;
  questionId: string;
  slot: ArtifactSlot;
}

export interface PlaybackTarget extends PlaybackRequest {
  /** Resolved take id; re-pinning a graded take must not replay the cached one. */
  artifactId: string;
}

export type PlaybackResponse =
  | {
      status: 'ready';
      artifactId: string;
      takeIndex: number;
      mimeType: string;
      data: string;
      durationMs?: number;
    }
  | { status: 'not-available'; reason: PlaybackUnavailableReason };

export type PlaybackState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; url: string; durationMs: number }
  | { phase: 'unavailable'; reason: PlaybackUnavailableReason }
  | { phase: 'error' };

export type FetchPlayback = (req: PlaybackRequest) => Promise<PlaybackResponse>;

const defaultFetch: FetchPlayback = async (req) => {
  const callable = httpsCallable<PlaybackRequest, PlaybackResponse>(
    functions,
    'getQuizArtifactPlaybackUrl'
  );
  const result = await callable(req);
  return result.data;
};

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function useQuizArtifactPlayback(
  request: PlaybackTarget | null,
  fetchPlayback: FetchPlayback = defaultFetch
): { state: PlaybackState; load: () => void } {
  const [state, setState] = useState<PlaybackState>({ phase: 'idle' });
  const urlRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const artifactId = request?.artifactId ?? null;
  const [loadedArtifactId, setLoadedArtifactId] = useState(artifactId);
  const artifactIdRef = useRef(artifactId);
  artifactIdRef.current = artifactId;

  // The teacher can re-pin the graded take live; the cached bytes are stale.
  if (artifactId !== loadedArtifactId) {
    setLoadedArtifactId(artifactId);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    inFlightRef.current = false;
    setState({ phase: 'idle' });
  }

  // Object URLs are a browser resource, not React state - revoke on unmount.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  const sessionId = request?.sessionId;
  const responseKey = request?.responseKey;
  const questionId = request?.questionId;
  const slot = request?.slot;

  const load = useCallback(() => {
    if (!sessionId || !responseKey || !questionId || !slot || !artifactId)
      return;
    if (inFlightRef.current || urlRef.current) return;
    inFlightRef.current = true;
    setState({ phase: 'loading' });
    void (async () => {
      try {
        const data = await fetchPlayback({
          sessionId,
          responseKey,
          questionId,
          slot,
        });
        // A take re-pinned mid-flight makes this answer the wrong one.
        if (artifactIdRef.current !== artifactId) return;
        if (data.status !== 'ready') {
          setState({ phase: 'unavailable', reason: data.reason });
          return;
        }
        const url = URL.createObjectURL(
          base64ToBlob(data.data, data.mimeType || 'audio/mp4')
        );
        urlRef.current = url;
        setState({ phase: 'ready', url, durationMs: data.durationMs ?? 0 });
      } catch {
        if (artifactIdRef.current === artifactId) setState({ phase: 'error' });
      } finally {
        if (artifactIdRef.current === artifactId) inFlightRef.current = false;
      }
    })();
  }, [fetchPlayback, sessionId, responseKey, questionId, slot, artifactId]);

  return { state, load };
}
