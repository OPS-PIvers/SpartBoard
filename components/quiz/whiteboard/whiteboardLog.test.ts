import { describe, it, expect, vi } from 'vitest';
import type { DrawableObject, PathObject, RectObject } from '@/types';
import {
  applyCommand,
  type DrawingCommand,
} from '@/components/widgets/DrawingWidget/commands';
import { MAX_UNDO_DEPTH } from '@/components/widgets/DrawingWidget/useCommandStack';
import {
  WHITEBOARD_LOG_BUDGET_BYTES,
  WhiteboardLogParseError,
  createWhiteboardLogRecorder,
  createWhiteboardReplayer,
  parseWhiteboardLog,
  replayAt,
  serializeWhiteboardLog,
  toLoggedObject,
  whiteboardLogDuration,
  type WhiteboardLog,
} from './whiteboardLog';

const path = (id: string, n = 5, z = 0): PathObject => ({
  id,
  kind: 'path',
  z,
  color: '#000000',
  width: 4,
  points: Array.from({ length: n }, (_, i) => ({ x: 10 + i * 10, y: 20 })),
});

const rect = (id: string, x = 0): RectObject => ({
  id,
  kind: 'rect',
  z: 1,
  x,
  y: 0,
  w: 100,
  h: 50,
  stroke: '#ff0000',
  strokeWidth: 2,
});

// Drives the recorder alongside a live, uncapped object list the way the canvas would.
const harness = (startingPageId = 'page-1') => {
  let clock = 0;
  const rec = createWhiteboardLogRecorder({
    startingPageId,
    now: () => clock,
  });
  let objects: DrawableObject[] = [];
  const past: DrawingCommand[] = [];
  const future: DrawingCommand[] = [];
  rec.start(0);
  return {
    rec,
    at: (ms: number) => {
      clock = ms;
    },
    get objects() {
      return objects;
    },
    push: (cmd: DrawingCommand, pointTimes?: number[]) => {
      objects = applyCommand(objects, cmd, 'forward');
      past.push(cmd);
      future.length = 0;
      rec.push(cmd, pointTimes ? { pointTimes } : undefined);
    },
    undo: () => {
      const cmd = past.pop();
      if (!cmd) return;
      objects = applyCommand(objects, cmd, 'reverse');
      future.push(cmd);
      rec.undo();
    },
    redo: () => {
      const cmd = future.pop();
      if (!cmd) return;
      objects = applyCommand(objects, cmd, 'forward');
      past.push(cmd);
      rec.redo();
    },
  };
};

const byId = (objs: readonly DrawableObject[]) =>
  [...objs].sort((a, b) => a.id.localeCompare(b.id));

describe('whiteboard log recorder', () => {
  it('ignores input before start', () => {
    const rec = createWhiteboardLogRecorder({ startingPageId: 'p' });
    rec.push({ kind: 'add', object: rect('r') });
    rec.undo();
    expect(rec.started).toBe(false);
    expect(rec.toLog().events).toEqual([]);
  });

  it('stamps events with ms offsets from start', () => {
    let clock = 1000;
    const rec = createWhiteboardLogRecorder({
      startingPageId: 'p',
      now: () => clock,
    });
    rec.start();
    clock = 1250.4;
    rec.push({ kind: 'add', object: rect('r') });
    clock = 2000;
    rec.undo();
    expect(rec.toLog().events.map((e) => e.t)).toEqual([250, 1000]);
  });

  it('stamps each path point and starts the event when the stroke began', () => {
    const h = harness();
    h.at(900);
    h.push({ kind: 'add', object: path('a', 3) }, [500, 600, 800]);
    const [event] = h.rec.toLog().events;
    expect(event.t).toBe(500);
    expect(event.cmd).toMatchObject({ k: 'add', pt: [0, 100, 300] });
  });

  it('drops points under 1 px apart but keeps the last point', () => {
    const h = harness();
    const jitter: PathObject = {
      ...path('a'),
      points: [
        { x: 0, y: 0 },
        { x: 0.3, y: 0.3 },
        { x: 0.6, y: 0.2 },
        { x: 5, y: 5 },
        { x: 5.2, y: 5.1 },
      ],
    };
    h.push({ kind: 'add', object: jitter }, [0, 10, 20, 30, 40]);
    const [event] = h.rec.toLog().events;
    if (event.cmd.k !== 'add' || event.cmd.o.kind !== 'path') {
      throw new Error('expected a path add');
    }
    expect(event.cmd.o.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 5.2, y: 5.1 },
    ]);
    expect(event.cmd.pt).toEqual([0, 30, 40]);
  });

  it('stores ids instead of snapshots for removes and clears', () => {
    const h = harness();
    h.push({ kind: 'add', object: rect('r') });
    h.push({ kind: 'add', object: path('p') });
    h.push({ kind: 'bulkRemove', objects: [rect('r')] });
    h.push({ kind: 'clear', objects: [path('p')] });
    const cmds = h.rec.toLog().events.map((e) => e.cmd);
    expect(cmds[2]).toEqual({ k: 'bulkRemove', ids: ['r'] });
    expect(cmds[3]).toEqual({ k: 'clear' });
  });

  it('keeps every event past the undo stack cap', () => {
    const h = harness();
    for (let i = 0; i < MAX_UNDO_DEPTH + 50; i++) {
      h.at(i * 10);
      h.push({ kind: 'add', object: rect(`r${i}`, i) });
    }
    expect(h.rec.toLog().events).toHaveLength(MAX_UNDO_DEPTH + 50);
  });

  it('signals once when the byte budget is reached', () => {
    const onBudgetReached = vi.fn();
    const rec = createWhiteboardLogRecorder({
      startingPageId: 'p',
      budgetBytes: 2000,
      onBudgetReached,
      now: () => 0,
    });
    rec.start(0);
    let i = 0;
    while (!rec.budgetReached) {
      rec.push({ kind: 'add', object: path(`p${i++}`, 4) });
    }
    rec.push({ kind: 'add', object: path(`p${i++}`, 4) });
    expect(onBudgetReached).toHaveBeenCalledTimes(1);
    expect(rec.bytes).toBeGreaterThanOrEqual(2000);
    const serialized = serializeWhiteboardLog(rec.toLog()).length;
    expect(Math.abs(rec.bytes - serialized)).toBeLessThan(5);
  });

  it('trips the default 4 MB budget', () => {
    const onBudgetReached = vi.fn();
    const rec = createWhiteboardLogRecorder({
      startingPageId: 'p',
      onBudgetReached,
      now: () => 0,
    });
    rec.start(0);
    const big = path('big', 2000);
    let i = 0;
    while (!rec.budgetReached && i < 10_000) {
      rec.push({ kind: 'add', object: { ...big, id: `b${i++}` } });
    }
    expect(onBudgetReached).toHaveBeenCalledTimes(1);
    expect(rec.bytes).toBeGreaterThanOrEqual(WHITEBOARD_LOG_BUDGET_BYTES);
    expect(rec.bytes).toBeLessThan(WHITEBOARD_LOG_BUDGET_BYTES + 100_000);
  });

  it('restart clears the log for a retake', () => {
    const h = harness();
    h.push({ kind: 'add', object: rect('r') });
    h.rec.start(0);
    expect(h.rec.toLog().events).toEqual([]);
  });
});

describe('whiteboard replay', () => {
  it('ends on the same objects as the live canvas', () => {
    const h = harness();
    h.at(100);
    h.push({ kind: 'add', object: path('a') }, [0, 10, 20, 30, 40]);
    h.at(200);
    h.push({ kind: 'add', object: rect('r') });
    h.at(300);
    h.push({ kind: 'update', before: rect('r'), after: rect('r', 40) });
    h.at(400);
    h.push({ kind: 'add', object: path('b') });
    h.at(500);
    h.undo();
    h.at(600);
    h.redo();
    h.at(700);
    h.push({ kind: 'bulkRemove', objects: [path('a')] });
    h.at(800);
    h.undo();
    h.at(900);
    h.push({ kind: 'add', object: path('c') });
    h.at(1000);
    h.undo();
    h.at(1100);
    h.undo();
    const log = h.rec.toLog();
    expect(byId(replayAt(log, whiteboardLogDuration(log)))).toEqual(
      byId(h.objects.map(toLoggedObject))
    );
  });

  it('undo past the live cap matches the live stack', () => {
    const h = harness();
    for (let i = 0; i < MAX_UNDO_DEPTH + 10; i++) {
      h.at(i);
      h.push({ kind: 'add', object: rect(`r${i}`, i) });
    }
    h.undo();
    h.undo();
    h.redo();
    const log = h.rec.toLog();
    expect(byId(replayAt(log, Infinity))).toEqual(byId(h.objects));
  });

  it('erased strokes appear and then vanish', () => {
    const h = harness();
    h.at(100);
    h.push({ kind: 'add', object: path('a') });
    h.at(500);
    h.push({ kind: 'remove', object: path('a') });
    h.at(700);
    h.push({ kind: 'clear', objects: [] });
    const log = h.rec.toLog();
    expect(replayAt(log, 50)).toEqual([]);
    expect(replayAt(log, 300).map((o) => o.id)).toEqual(['a']);
    expect(replayAt(log, 600)).toEqual([]);
  });

  it('undo of a clear restores what the page held', () => {
    const h = harness();
    h.at(100);
    h.push({ kind: 'add', object: path('a') });
    h.push({ kind: 'add', object: rect('r') });
    h.at(200);
    h.push({ kind: 'clear', objects: [...h.objects] });
    h.at(300);
    h.undo();
    const log = h.rec.toLog();
    expect(replayAt(log, 250)).toEqual([]);
    expect(byId(replayAt(log, 300))).toEqual(byId(h.objects));
  });

  it('draws a stroke point by point at its recorded pace', () => {
    const h = harness();
    h.push({ kind: 'add', object: path('a', 5) }, [100, 200, 300, 400, 500]);
    const log = h.rec.toLog();
    const pointsAt = (ms: number) => {
      const found = replayAt(log, ms).find((o) => o.id === 'a');
      return found?.kind === 'path' ? found.points.length : 0;
    };
    expect(pointsAt(99)).toBe(0);
    expect(pointsAt(100)).toBe(1);
    expect(pointsAt(250)).toBe(2);
    expect(pointsAt(500)).toBe(5);
    expect(whiteboardLogDuration(log)).toBe(500);
  });

  it('scrubbing backwards gives the same state as a fresh replay', () => {
    const h = harness();
    for (let i = 0; i < 650; i++) {
      h.at(i * 10);
      if (i % 7 === 3) h.undo();
      else if (i % 11 === 5) h.redo();
      else
        h.push({ kind: 'add', object: path(`p${i}`, 3) }, [
          i * 10,
          i * 10 + 2,
          i * 10 + 4,
        ]);
    }
    const log = h.rec.toLog();
    const replayer = createWhiteboardReplayer(log);
    const times = [6500, 3001, 5003, 10, 2004, 6500, 0, 4500];
    for (const ms of times) {
      expect(byId(replayer.seek(ms))).toEqual(byId(replayAt(log, ms)));
    }
  });

  it('scrubs a long take quickly', () => {
    const h = harness();
    for (let i = 0; i < 3000; i++) {
      h.at(i * 100);
      h.push(
        { kind: 'add', object: path(`p${i}`, 40) },
        Array.from({ length: 40 }, (_, j) => i * 100 + j)
      );
    }
    const log = h.rec.toLog();
    const replayer = createWhiteboardReplayer(log);
    const started = performance.now();
    for (let ms = 0; ms <= 300_000; ms += 1000) replayer.seek(ms);
    for (let ms = 300_000; ms >= 0; ms -= 10_000) replayer.seek(ms);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(replayer.seek(300_000)).toHaveLength(3000);
  });

  it('starts from an empty page', () => {
    const h = harness();
    h.at(10);
    h.push({ kind: 'add', object: rect('r') });
    expect(replayAt(h.rec.toLog(), 0)).toEqual([]);
  });
});

describe('whiteboard log serialize and parse', () => {
  const sample = (): WhiteboardLog => {
    const h = harness('grid-abc');
    h.at(10);
    h.push({ kind: 'add', object: path('a', 3) }, [10, 20, 30]);
    h.at(40);
    h.push({ kind: 'add', object: rect('r') });
    h.at(50);
    h.undo();
    h.at(60);
    h.redo();
    h.at(70);
    h.push({ kind: 'bulkRemove', objects: [rect('r')] });
    return h.rec.toLog();
  };

  it('round trips', () => {
    const log = sample();
    expect(parseWhiteboardLog(serializeWhiteboardLog(log))).toEqual(log);
  });

  it('accepts a decoded object', () => {
    const log = sample();
    expect(parseWhiteboardLog(JSON.parse(serializeWhiteboardLog(log)))).toEqual(
      log
    );
  });

  const corrupt = (mutate: (raw: Record<string, unknown>) => void) => {
    const raw = JSON.parse(serializeWhiteboardLog(sample())) as Record<
      string,
      unknown
    >;
    mutate(raw);
    return () => parseWhiteboardLog(raw);
  };
  const events = (raw: Record<string, unknown>) =>
    raw.events as Record<string, unknown>[];

  it.each([
    ['not JSON', () => parseWhiteboardLog('{nope')],
    ['wrong version', corrupt((r) => (r.v = 2))],
    ['wrong page size', corrupt((r) => (r.page = { w: 800, h: 600 }))],
    ['missing starting page', corrupt((r) => delete r.startingPageId)],
    ['times out of order', corrupt((r) => (events(r)[1].t = 0))],
    ['negative time', corrupt((r) => (events(r)[0].t = -1))],
    ['unknown command', corrupt((r) => (events(r)[0].cmd = { k: 'paint' }))],
    [
      'point times length mismatch',
      corrupt((r) => ((events(r)[0].cmd as Record<string, unknown>).pt = [0])),
    ],
    [
      'bad object',
      corrupt(
        (r) =>
          ((events(r)[1].cmd as Record<string, unknown>).o = {
            id: 'x',
            kind: 'rect',
            z: 0,
          })
      ),
    ],
    [
      'image object',
      corrupt(
        (r) =>
          ((events(r)[1].cmd as Record<string, unknown>).o = {
            id: 'x',
            kind: 'image',
            z: 0,
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            src: 'https://example.com/a.png',
          })
      ),
    ],
  ])('rejects %s', (_label, run) => {
    expect(run).toThrow(WhiteboardLogParseError);
  });
});
