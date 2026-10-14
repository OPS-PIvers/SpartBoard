/** DEV-only harness for the student whiteboard canvas at /whiteboard-dev. */
import React, { useMemo, useRef, useState } from 'react';
import type { DrawableObject, WhiteboardStartingPage } from '@/types';
import type { DrawingCommand } from '@/components/widgets/DrawingWidget/commands';
import {
  WhiteboardCanvas,
  type WhiteboardCanvasHandle,
  type WhiteboardCaptureSink,
} from '@/components/quiz/whiteboard/WhiteboardCanvas';
import { renderWhiteboardPicture } from '@/components/quiz/whiteboard/whiteboardPicture';

const PAGES: Record<string, WhiteboardStartingPage> = {
  blank: { pattern: { kind: 'blank' } },
  grid: { pattern: { kind: 'grid' } },
  'coordinate-plane': {
    pattern: {
      kind: 'coordinate-plane',
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
    },
  },
  'number-line': { pattern: { kind: 'number-line', min: 0, max: 10, step: 1 } },
  shape: { pattern: { kind: 'shape', shape: 'triangle' } },
};

type LogLine = { t: number; label: string };

export const WhiteboardDevHarness: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const [pageKey, setPageKey] = useState(params.get('page') ?? 'grid');
  const [disabled, setDisabled] = useState(params.get('prep') === '1');
  const [log, setLog] = useState<LogLine[]>([]);
  const [objects, setObjects] = useState<DrawableObject[]>([]);
  const [picture, setPicture] = useState<string | null>(null);
  const [t0, setT0] = useState(() => performance.now());
  const canvasRef = useRef<WhiteboardCanvasHandle>(null);
  const startingPage = PAGES[pageKey] ?? PAGES.grid;

  const recorder = useMemo<WhiteboardCaptureSink>(() => {
    const add = (label: string) =>
      setLog((prev) => [
        ...prev.slice(-7),
        { t: Math.round(performance.now() - t0), label },
      ]);
    return {
      push: (cmd: DrawingCommand, meta) =>
        add(
          `${cmd.kind}${meta?.pointTimes ? ` (${meta.pointTimes.length} pts)` : ''}`
        ),
      undo: () => add('undo'),
      redo: () => add('redo'),
    };
  }, [t0]);

  const exportPicture = async () => {
    const objs = canvasRef.current?.flush() ?? [];
    const blob = await renderWhiteboardPicture(objs, startingPage);
    setPicture(URL.createObjectURL(blob));
  };

  return (
    <div className="flex h-screen [height:100dvh] flex-col bg-gradient-to-b from-white to-slate-100">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-amber-50 px-4 py-2 text-xs text-slate-700">
        <strong>/whiteboard-dev</strong>
        <select
          // no-tour-anchor: dev-only harness
          value={pageKey}
          onChange={(e) => setPageKey(e.target.value)}
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          {Object.keys(PAGES).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input
            // no-tour-anchor: dev-only harness
            type="checkbox"
            checked={disabled}
            onChange={(e) => setDisabled(e.target.checked)}
          />
          prep (drawing off)
        </label>
        <button
          // no-tour-anchor: dev-only harness
          type="button"
          onClick={() => {
            setT0(performance.now());
            setLog([]);
            setPicture(null);
          }}
          className="rounded border border-slate-300 bg-white px-2 py-0.5"
        >
          retake
        </button>
        <button
          // no-tour-anchor: dev-only harness
          type="button"
          onClick={() => void exportPicture()}
          className="rounded border border-slate-300 bg-white px-2 py-0.5"
        >
          export picture
        </button>
        <span data-testid="harness-count">{objects.length} objects</span>
        <span className="font-mono">
          {log.map((l) => `${l.t}ms ${l.label}`).join(' · ')}
        </span>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col p-6">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">3 / 8</span>
        </div>
        <h2 className="mb-4 text-lg font-bold text-slate-900">
          Plot the points (2, 3) and (-4, 1), then draw the line through them.
        </h2>
        <WhiteboardCanvas
          key={`${t0}-${pageKey}`}
          ref={canvasRef}
          startingPage={startingPage}
          disabled={disabled}
          recorder={recorder}
          onObjectsChange={setObjects}
          className="flex-1"
        />
      </div>
      {picture && (
        <a
          href={picture}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-4 right-4 w-64 rounded-lg border border-slate-300 bg-white p-1 shadow-lg"
        >
          <img src={picture} alt="Exported picture" className="w-full" />
        </a>
      )}
    </div>
  );
};
