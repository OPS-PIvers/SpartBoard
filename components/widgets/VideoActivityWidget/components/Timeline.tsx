/**
 * Timeline — YouTube IFrame player + custom scrubber for the Video Activity
 * editor.
 *
 * Renders the player at the top, then a horizontal track underneath that
 * shows:
 *   - Existing question markers at each `question.timestamp`
 *   - The current playhead position
 *   - A "+" pill at the playhead the teacher clicks to add a question at
 *     that exact second
 *
 * The scrubber sits in its own DOM row below the iframe — it does NOT
 * overlay the player — so YouTube's own controls remain reachable and the
 * iframe never fights us for pointer events. Clicking anywhere on the
 * track seeks the player.
 *
 * Player lifecycle is owned here. The component re-instantiates the
 * `YT.Player` whenever `videoId` changes, polls `getCurrentTime()` on a
 * 250ms interval while the player is in PLAYING state, and tears down on
 * unmount. Reuses the shared `loadYouTubeApi` singleton from utils so we
 * don't double-load the IFrame script when MusicWidget is also mounted.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  loadYouTubeApi,
  YT_PLAYER_STATE,
  type YTPlayer,
} from '@/utils/youtube';
import type { VideoActivityQuestion } from '@/types';

export interface TimelineProps {
  /** 11-character YouTube video id. Use `extractYouTubeId(url)` to derive. */
  videoId: string;
  /** Existing questions to render as markers on the track. */
  questions: VideoActivityQuestion[];
  /**
   * Called when the teacher clicks the "+" pill at the playhead. Receives
   * the current playhead time in seconds, snapped to integer.
   */
  onAddAtTime: (seconds: number) => void;
  /**
   * Called when the teacher clicks an existing question marker.
   * Receives the question id so the parent can scroll/expand the
   * matching question editor below.
   */
  onSelectQuestion?: (questionId: string) => void;
  /**
   * Called when the teacher drags an existing question marker to a new
   * position on the track. Receives the question id and the new timestamp
   * in seconds (snapped to integer). The parent is responsible for
   * persisting the change (and re-sorting if needed).
   */
  onMarkerDrag?: (questionId: string, newSeconds: number) => void;
  /** Optional id of a question the parent considers "active" (rendered larger). */
  activeQuestionId?: string;
}

/** Format seconds as M:SS or H:MM:SS for the playhead label. */
function formatHms(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

export const Timeline: React.FC<TimelineProps> = ({
  videoId,
  questions,
  onAddAtTime,
  onSelectQuestion,
  onMarkerDrag,
  activeQuestionId,
}) => {
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const [duration, setDuration] = useState(0);
  // Mirror `duration` into a ref so long-lived event handlers (the marker
  // drag pointermove, in particular) can read the current value without
  // capturing it in their pointer-down closure. Without this, a marker
  // drag started before the YT player reports its duration would compute
  // every drop position against `duration = 0`.
  const durationRef = useRef(0);
  // eslint-disable-next-line react-hooks/refs
  durationRef.current = duration;
  const [playhead, setPlayhead] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  /** Per-marker drag overlay: id → seconds being previewed. Cleared on pointer-up. */
  const [markerDragSec, setMarkerDragSec] = useState<{
    id: string;
    seconds: number;
  } | null>(null);
  // Each player instance gets a unique DOM id. React's StrictMode mounts
  // effects twice in dev; reusing the same id collides because IFrame API
  // takes ownership of the element by id. Lazy-initialized state (not a
  // ref) so the id is read during render without triggering the
  // refs-during-render lint.
  const [playerElementId] = useState(
    () => `va-timeline-player-${crypto.randomUUID().slice(0, 8)}`
  );
  // Bumped when the player-init effect bails because the placeholder
  // element hasn't been committed yet. Listed in the effect deps so the
  // bump retriggers the same effect cleanly.
  const [initRetryToken, setInitRetryToken] = useState(0);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current != null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollIntervalRef.current = window.setInterval(() => {
      if (playerRef.current) {
        try {
          setPlayhead(playerRef.current.getCurrentTime());
        } catch {
          /* iframe gone — next render handles cleanup */
        }
      }
    }, 250);
  }, [stopPolling]);

  // Reset transient player state when videoId changes — done at render
  // time via the adjust-state-while-rendering pattern to avoid the
  // setState-in-effect anti-pattern.
  const [prevVideoId, setPrevVideoId] = useState(videoId);
  if (prevVideoId !== videoId) {
    setPrevVideoId(videoId);
    setPlayerReady(false);
    setDuration(0);
    setPlayhead(0);
  }

  // (Re)create the player whenever videoId changes.
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;

    const teardown = () => {
      stopPolling();
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          /* ignore */
        }
        playerRef.current = null;
      }
    };

    loadYouTubeApi(() => {
      if (cancelled || !playerContainerRef.current || !window.YT?.Player) {
        return;
      }
      // Replace any previous instance bound to this container.
      teardown();
      // The target div is rendered in JSX with id=playerElementId; YT.Player
      // takes ownership of it by id and replaces it with an iframe. We don't
      // re-create it here — leaving DOM ownership to React first, then YT —
      // because manual createElement() can race React's reconciliation when
      // the component re-renders.
      if (!document.getElementById(playerElementId)) {
        // JSX hasn't flushed yet on this render. Bumping `initRetryToken`
        // re-triggers this effect on the next tick so we get a second
        // chance once React commits the placeholder div. Without this
        // retry, racing the YT API against React mount could leave the
        // user stuck on the "Loading player…" placeholder forever.
        window.setTimeout(() => {
          if (!cancelled) setInitRetryToken((n) => n + 1);
        }, 50);
        return;
      }
      playerRef.current = new window.YT.Player(playerElementId, {
        height: '100%',
        width: '100%',
        videoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (cancelled || !playerRef.current) return;
            try {
              setDuration(playerRef.current.getDuration());
              setPlayhead(playerRef.current.getCurrentTime());
              setPlayerReady(true);
            } catch {
              /* ignore */
            }
          },
          onStateChange: ({ data }: { data: number }) => {
            if (data === YT_PLAYER_STATE.PLAYING) {
              startPolling();
            } else {
              stopPolling();
              // One last sample so the playhead reflects the pause point.
              if (playerRef.current) {
                try {
                  setPlayhead(playerRef.current.getCurrentTime());
                  // Duration may not be known until first play on some videos.
                  const d = playerRef.current.getDuration();
                  if (d > 0) setDuration(d);
                } catch {
                  /* ignore */
                }
              }
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      teardown();
    };
  }, [videoId, playerElementId, startPolling, stopPolling, initRetryToken]);

  // Render markers and playhead.
  const safeDuration = duration > 0 ? duration : 1;
  const playheadPct = Math.max(
    0,
    Math.min(100, (playhead / safeDuration) * 100)
  );

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!playerRef.current || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const target = Math.max(0, Math.min(duration, ratio * duration));
    try {
      playerRef.current.seekTo(target, true);
      setPlayhead(target);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-2">
      <div
        ref={playerContainerRef}
        className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-black"
        style={{ aspectRatio: '16 / 9' }}
      >
        <div id={playerElementId} className="w-full h-full" />
        {!playerReady && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            Loading player…
          </div>
        )}
      </div>

      {/* Custom scrubber + question markers + add-at-playhead pill */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest">
          <span>Timeline</span>
          <span>
            {formatHms(playhead)} / {formatHms(duration)}
          </span>
        </div>
        <div
          ref={trackRef}
          role="slider"
          aria-label="Video timeline"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(playhead)}
          aria-valuetext={`${formatHms(playhead)} of ${formatHms(duration)}`}
          tabIndex={0}
          onClick={handleTrackClick}
          onKeyDown={(e) => {
            if (!playerRef.current || duration <= 0) return;
            const step = 5; // 5-second nudge per arrow press
            const bigStep = Math.max(15, Math.floor(duration / 10));
            const seek = (next: number) => {
              const clamped = Math.max(0, Math.min(duration, next));
              playerRef.current?.seekTo(clamped, true);
              setPlayhead(clamped);
              e.preventDefault();
            };
            if (e.key === 'ArrowLeft') seek(playhead - step);
            else if (e.key === 'ArrowRight') seek(playhead + step);
            else if (e.key === 'PageUp') seek(playhead - bigStep);
            else if (e.key === 'PageDown') seek(playhead + bigStep);
            else if (e.key === 'Home') seek(0);
            else if (e.key === 'End') seek(duration);
          }}
          className="relative h-8 rounded-lg bg-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-blue-primary focus:ring-offset-2"
        >
          {/* Played-progress fill */}
          <div
            className="absolute inset-y-0 left-0 bg-brand-blue-primary/30 rounded-lg pointer-events-none"
            style={{ width: `${playheadPct}%` }}
          />

          {/* Question markers */}
          {questions.map((q) => {
            const previewSec =
              markerDragSec && markerDragSec.id === q.id
                ? markerDragSec.seconds
                : q.timestamp;
            const pct = (previewSec / safeDuration) * 100;
            if (pct < 0 || pct > 100) return null;
            const isActive = q.id === activeQuestionId;
            const isDragging =
              markerDragSec !== null && markerDragSec.id === q.id;

            const handleMarkerPointerDown = (
              e: React.PointerEvent<HTMLButtonElement>
            ) => {
              e.stopPropagation();
              if (!trackRef.current || duration <= 0 || !onMarkerDrag) {
                // Drag not possible — fall through to plain click on pointer-up.
              }
              const startX = e.clientX;
              const startY = e.clientY;
              const target = e.currentTarget;
              const trackEl = trackRef.current;
              let dragged = false;
              let lastSec = q.timestamp;

              const computeSec = (clientX: number) => {
                const liveDuration = durationRef.current;
                if (!trackEl || liveDuration <= 0) return q.timestamp;
                const rect = trackEl.getBoundingClientRect();
                const ratio = (clientX - rect.left) / rect.width;
                const clamped = Math.max(0, Math.min(1, ratio));
                return Math.round(clamped * liveDuration);
              };

              const onMoveEvt = (ev: PointerEvent) => {
                if (!dragged) {
                  const dx = ev.clientX - startX;
                  const dy = ev.clientY - startY;
                  if (dx * dx + dy * dy < 16) return; // 4px threshold
                  dragged = true;
                }
                if (!onMarkerDrag) return;
                lastSec = computeSec(ev.clientX);
                setMarkerDragSec({ id: q.id, seconds: lastSec });
              };

              const onUpEvt = (ev: PointerEvent) => {
                window.removeEventListener('pointermove', onMoveEvt);
                window.removeEventListener('pointerup', onUpEvt);
                window.removeEventListener('pointercancel', onUpEvt);
                try {
                  target.releasePointerCapture(ev.pointerId);
                } catch {
                  // already released
                }
                if (dragged && onMarkerDrag) {
                  onMarkerDrag(q.id, lastSec);
                  setMarkerDragSec(null);
                  // Seek the player to the new spot so the teacher sees the
                  // video context that matches the new timestamp.
                  if (playerRef.current && duration > 0) {
                    try {
                      playerRef.current.seekTo(lastSec, true);
                      setPlayhead(lastSec);
                    } catch {
                      // player teardown — ignore
                    }
                  }
                } else {
                  // Plain click — select + seek.
                  if (playerRef.current && duration > 0) {
                    try {
                      playerRef.current.seekTo(q.timestamp, true);
                      setPlayhead(q.timestamp);
                    } catch {
                      // ignore
                    }
                  }
                  onSelectQuestion?.(q.id);
                }
              };

              try {
                target.setPointerCapture(e.pointerId);
              } catch {
                // capture not supported — window listeners still work
              }
              window.addEventListener('pointermove', onMoveEvt);
              window.addEventListener('pointerup', onUpEvt);
              window.addEventListener('pointercancel', onUpEvt);
            };

            return (
              <button
                key={q.id}
                type="button"
                onPointerDown={handleMarkerPointerDown}
                aria-label={`Question at ${formatHms(previewSec)}: ${q.text || 'untitled'} — drag to move, click to select`}
                title={`${formatHms(previewSec)} — ${q.text || 'Untitled question'}`}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-all touch-none ${
                  isDragging
                    ? 'w-4 h-4 bg-emerald-600 ring-2 ring-emerald-300 cursor-grabbing'
                    : isActive
                      ? 'w-4 h-4 bg-emerald-500 ring-2 ring-emerald-200 cursor-grab'
                      : 'w-3 h-3 bg-emerald-500 hover:w-4 hover:h-4 cursor-grab'
                }`}
                style={{ left: `${pct}%` }}
              />
            );
          })}

          {/* Playhead indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-brand-blue-primary pointer-events-none"
            style={{ left: `${playheadPct}%` }}
          />
        </div>

        {/* Add-at-playhead button */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xxs text-slate-500">
            Click the timeline to seek. Click a green marker to select it, or
            drag the marker to retime its question.
          </p>
          <button
            type="button"
            disabled={!playerReady}
            onClick={() => onAddAtTime(Math.floor(playhead))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary text-white font-bold px-3 py-1.5 text-xs hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add at {formatHms(playhead)}
          </button>
        </div>
      </div>
    </div>
  );
};
