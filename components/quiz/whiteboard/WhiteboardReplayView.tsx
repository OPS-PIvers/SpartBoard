// LOCAL STUB until W8 lands; not committed.
import React from 'react';
import { Play } from 'lucide-react';
import type { WhiteboardStartingPage } from '@/types';
import type { WhiteboardLog } from './whiteboardLogTypes';
export const WhiteboardReplayView: React.FC<{
  pictureUrl: string | null;
  log: WhiteboardLog | null;
  startingPage?: WhiteboardStartingPage;
  audioSrc?: string | null;
  durationMs: number;
  loading?: boolean;
  markers?: { id: string; ms: number; active?: boolean }[];
  seekToMs?: number;
  seekNonce?: number;
  onPositionChange?: (ms: number) => void;
  controlsEnd?: React.ReactNode;
}> = ({ pictureUrl, durationMs, markers }) => (
  <div>
    {pictureUrl && (
      <img
        src={pictureUrl}
        alt=""
        className="aspect-[4/3] w-full rounded-xl border border-slate-200 bg-white object-contain"
      />
    )}
    <div className="mt-2 flex items-center gap-3">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue-primary text-white"
      >
        <Play className="h-4 w-4" />
      </button>
      <div className="relative h-2 flex-1 rounded-full bg-slate-200">
        {markers?.map((m) => (
          <span
            key={m.id}
            className="absolute -top-1 h-4 w-1 rounded bg-amber-500"
            style={{ left: `${(m.ms / Math.max(1, durationMs)) * 100}%` }}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-slate-500">
        0:00 / {Math.round(durationMs / 1000)}s
      </span>
    </div>
  </div>
);
