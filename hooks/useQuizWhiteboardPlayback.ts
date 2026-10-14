import { useCallback, useEffect, useRef, useState } from 'react';
import { parseWhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLog';
import type { WhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLogTypes';
import {
  base64ToBlob,
  defaultFetch as defaultFetchPlayback,
  type FetchPlayback,
  type PlaybackPart,
  type PlaybackRequest,
  type PlaybackResponse,
  type PlaybackUnavailableReason,
} from './useQuizArtifactPlayback';

export interface WhiteboardPlaybackTarget extends Omit<
  PlaybackRequest,
  'part'
> {
  /** The take's picture id; re-pinning the graded take must not show the cached one. */
  pictureId: string;
  hasLog: boolean;
  hasAudio: boolean;
}

export type WhiteboardPlaybackState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | {
      phase: 'ready';
      pictureUrl: string;
      log: WhiteboardLog | null;
      audioUrl: string | null;
      durationMs: number;
    }
  | { phase: 'unavailable'; reason: PlaybackUnavailableReason }
  | { phase: 'error' };

function decodeLog(data: string): WhiteboardLog | null {
  try {
    const binary = atob(data);
    const utf8 = new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0))
    );
    return parseWhiteboardLog(utf8);
  } catch {
    return null;
  }
}

/** Lazy fetch of the student's own whiteboard take: the picture is required, log and audio are best effort. */
export function useQuizWhiteboardPlayback(
  request: WhiteboardPlaybackTarget | null,
  fetchPlayback: FetchPlayback = defaultFetchPlayback
): { state: WhiteboardPlaybackState; load: () => void } {
  const [state, setState] = useState<WhiteboardPlaybackState>({
    phase: 'idle',
  });
  const urlsRef = useRef<string[]>([]);
  const generationRef = useRef(0);
  const loadingGenerationRef = useRef<number | null>(null);
  const pictureId = request?.pictureId ?? null;
  const [loadedPictureId, setLoadedPictureId] = useState(pictureId);

  if (pictureId !== loadedPictureId) {
    setLoadedPictureId(pictureId);

    generationRef.current += 1;
    setState({ phase: 'idle' });
  }

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, [pictureId]);

  const sessionId = request?.sessionId;
  const responseKey = request?.responseKey;
  const questionId = request?.questionId;
  const slot = request?.slot;
  const hasLog = request?.hasLog ?? false;
  const hasAudio = request?.hasAudio ?? false;

  const load = useCallback(() => {
    if (!sessionId || !responseKey || !questionId || !slot || !pictureId)
      return;
    const generation = generationRef.current;
    if (
      loadingGenerationRef.current === generation ||
      urlsRef.current.length > 0
    )
      return;
    loadingGenerationRef.current = generation;
    setState({ phase: 'loading' });
    const fetchPart = (part: PlaybackPart): Promise<PlaybackResponse | null> =>
      fetchPlayback({ sessionId, responseKey, questionId, slot, part });
    const optional = (part: PlaybackPart, wanted: boolean) =>
      wanted ? fetchPart(part).catch(() => null) : Promise.resolve(null);
    void (async () => {
      try {
        const [picture, log, audio] = await Promise.all([
          fetchPart('picture'),
          optional('log', hasLog),
          optional('audio', hasAudio),
        ]);
        const stale = generationRef.current !== generation;
        if (!picture || picture.status !== 'ready') {
          if (!stale && picture)
            setState({ phase: 'unavailable', reason: picture.reason });
          return;
        }
        if (stale) return;
        const pictureUrl = URL.createObjectURL(
          base64ToBlob(picture.data, picture.mimeType || 'image/png')
        );
        const audioUrl =
          audio?.status === 'ready'
            ? URL.createObjectURL(
                base64ToBlob(audio.data, audio.mimeType || 'audio/mp4')
              )
            : null;
        urlsRef.current = audioUrl ? [pictureUrl, audioUrl] : [pictureUrl];
        const parsedLog = log?.status === 'ready' ? decodeLog(log.data) : null;
        const lastEventMs = parsedLog?.events.at(-1)?.t ?? 0;
        const audioMs = audio?.status === 'ready' ? (audio.durationMs ?? 0) : 0;
        setState({
          phase: 'ready',
          pictureUrl,
          log: parsedLog,
          audioUrl,
          durationMs: Math.max(audioMs, lastEventMs),
        });
      } catch {
        if (generationRef.current === generation) setState({ phase: 'error' });
      } finally {
        if (loadingGenerationRef.current === generation)
          loadingGenerationRef.current = null;
      }
    })();
  }, [
    fetchPlayback,
    sessionId,
    responseKey,
    questionId,
    slot,
    pictureId,
    hasLog,
    hasAudio,
  ]);

  return { state, load };
}
