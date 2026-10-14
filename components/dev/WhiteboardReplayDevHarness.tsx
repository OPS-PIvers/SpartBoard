/**
 * WhiteboardReplayDevHarness — DEV-only fixtures for the shared whiteboard
 * replay view (grader, student review, student results). Mounted at
 * /whiteboard-replay-dev in DEV builds only.
 */

import React, { useMemo, useState } from 'react';
import type { DrawableObject, WhiteboardStartingPage } from '@/types';
import { WhiteboardReplayView } from '@/components/quiz/whiteboard/WhiteboardReplayView';
import {
  PAGE_H,
  PAGE_W,
  paintReplayFrame,
  type ReplayMarker,
} from '@/components/quiz/whiteboard/replayFrame';
import {
  renderStartingPageCanvas,
  startingPageId,
} from '@/utils/whiteboard/startingPage';
import {
  replayAt,
  whiteboardLogDuration,
  type WhiteboardLog,
  type WhiteboardLogEvent,
} from '@/components/quiz/whiteboard/whiteboardLog';

type Event = WhiteboardLogEvent;
type Pt = { x: number; y: number };

const stroke = (
  id: string,
  z: number,
  t0: number,
  msPerPoint: number,
  points: Pt[],
  color = '#1d4ed8',
  width = 6
): Event => ({
  t: t0,
  op: 'do',
  cmd: {
    kind: 'add',
    object: { id, kind: 'path', z, points, color, width },
    pointTimes: points.map((_, i) => i * msPerPoint),
  },
});

const line = (x1: number, y1: number, x2: number, y2: number, n = 40): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: x1 + ((x2 - x1) * i) / n,
    y: y1 + ((y2 - y1) * i) / n,
  }));

const dot = (cx: number, cy: number, r = 9): Pt[] =>
  Array.from({ length: 13 }, (_, i) => ({
    x: cx + r * Math.cos((i / 12) * Math.PI * 2),
    y: cy + r * Math.sin((i / 12) * Math.PI * 2),
  }));

const PLANE = {
  kind: 'coordinate-plane' as const,
  xMin: -8,
  xMax: 8,
  yMin: -6,
  yMax: 6,
};
const STARTING_PAGE: WhiteboardStartingPage = { pattern: PLANE };

// Page coordinates for a plane point on the -8..8 by -6..6 plane (72 px margins).
const P = (x: number, y: number): Pt => ({ x: 800 + x * 91, y: 600 - y * 88 });

const seg = (a: Pt, b: Pt, n?: number) => line(a.x, a.y, b.x, b.y, n);

const buildLog = (): WhiteboardLog => {
  const events: Event[] = [
    stroke('p1', 1, 3000, 30, dot(P(0, -1).x, P(0, -1).y)),
    stroke('p2', 2, 6500, 30, dot(P(1, 1).x, P(1, 1).y)),
    stroke('wrong', 3, 14000, 40, seg(P(-3, -4.5), P(3, 4.5)), '#dc2626'),
    { t: 21000, op: 'do', cmd: { kind: 'remove', id: 'wrong' } },
    stroke('p3', 4, 24000, 30, dot(P(2, 3).x, P(2, 3).y)),
    stroke('answer', 5, 28000, 45, seg(P(-2, -5), P(3.5, 6), 80)),
    stroke('scribble', 6, 34000, 25, seg(P(4.5, -2), P(6.5, -3)), '#0f172a'),
    stroke('rub', 7, 37000, 25, seg(P(4.3, -2.5), P(6.7, -2.5)), 'eraser', 40),
    {
      t: 40000,
      op: 'do',
      cmd: {
        kind: 'add',
        object: {
          id: 'label',
          kind: 'text',
          z: 8,
          x: P(2.6, 5).x + 30,
          y: P(2.6, 5).y - 20,
          w: 260,
          h: 56,
          content: 'y = 2x − 1',
          fontFamily: 'Lexend',
          fontSize: 40,
          color: '#0f172a',
        },
      },
    },
  ];
  return {
    v: 1,
    page: { w: 1600, h: 1200 },
    startingPageId: startingPageId(STARTING_PAGE),
    events,
  };
};

const renderPicture = (log: WhiteboardLog): string => {
  const c = document.createElement('canvas');
  c.width = PAGE_W * 2;
  c.height = PAGE_H * 2;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const bg = renderStartingPageCanvas(STARTING_PAGE, null, 2);
  const objs: DrawableObject[] = replayAt(log, whiteboardLogDuration(log));
  paintReplayFrame(ctx, bg, document.createElement('canvas'), objs, 2);
  return c.toDataURL('image/png');
};

// Speech-like bursts with pauses, as a 16 kHz mono WAV.
const buildNarration = (seconds: number): string => {
  const rate = 16000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) =>
    [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const phrase = Math.sin(t * 0.9) + Math.sin(t * 2.3) > 0.2 ? 1 : 0;
    const syll = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 4);
    const s =
      phrase * syll * 0.5 * Math.sin(2 * Math.PI * (140 + 40 * syll) * t);
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
};

const MARKERS: ReplayMarker[] = [
  { id: 'c1', ms: 14500 },
  { id: 'c2', ms: 29000, active: true },
];

export const WhiteboardReplayDevHarness: React.FC = () => {
  const log = useMemo(() => buildLog(), []);
  const picture = useMemo(() => renderPicture(log), [log]);
  const duration = Math.ceil(whiteboardLogDuration(log) / 1000) * 1000 + 4000;
  const [audio] = useState(() => buildNarration(duration / 1000));
  const startingPage = STARTING_PAGE;

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-100 pb-16 font-sans">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 p-6">
        <section data-state="grader">
          <h2 className="mb-2 text-sm font-bold text-slate-700">
            Grader, narrated take, with comment markers
          </h2>
          <WhiteboardReplayView
            pictureUrl={picture}
            log={log}
            startingPage={startingPage}
            audioSrc={audio}
            durationMs={duration}
            markers={MARKERS}
            controlsEnd={
              <span className="rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-500">
                W9 controls
              </span>
            }
          />
        </section>
        <section data-state="draw-only">
          <h2 className="mb-2 text-sm font-bold text-slate-700">
            Draw-only take (silent timeline)
          </h2>
          <WhiteboardReplayView
            pictureUrl={picture}
            log={log}
            startingPage={startingPage}
            durationMs={duration}
          />
        </section>
        <section data-state="loading">
          <h2 className="mb-2 text-sm font-bold text-slate-700">Loading</h2>
          <WhiteboardReplayView
            pictureUrl={null}
            log={null}
            durationMs={0}
            loading
          />
        </section>
        <section data-state="no-log">
          <h2 className="mb-2 text-sm font-bold text-slate-700">
            Picture only (log missing)
          </h2>
          <WhiteboardReplayView
            pictureUrl={picture}
            log={null}
            durationMs={duration}
          />
        </section>
      </div>
    </div>
  );
};

export default WhiteboardReplayDevHarness;
