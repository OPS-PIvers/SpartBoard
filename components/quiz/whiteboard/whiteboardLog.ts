import type { DrawableObject, PathObject, Point } from '@/types';
import {
  applyCommand,
  type DrawingCommand,
} from '@/components/widgets/DrawingWidget/commands';

import {
  WHITEBOARD_LOG_BUDGET_BYTES,
  WHITEBOARD_PAGE,
  type WhiteboardLog,
  type WhiteboardLogCommand,
  type WhiteboardLogEntry,
  type WhiteboardLogEvent,
} from './whiteboardLogTypes';

export {
  WHITEBOARD_LOG_BUDGET_BYTES,
  WHITEBOARD_PAGE,
  type WhiteboardLog,
  type WhiteboardLogCommand,
  type WhiteboardLogEvent,
};

// Whiteboard capture log (plan D14, C1): uncapped, separate from the 100-deep undo stack.

const WHITEBOARD_LOG_VERSION = 1;

const MIN_POINT_DISTANCE = 1;

const round1 = (n: number) => Math.round(n * 10) / 10;

// Drops points under 1 px from the last kept point (always keeps the last) and rounds to 0.1 px.
const thinPathPoints = (points: Point[]): number[] => {
  const kept: number[] = [];
  let last: Point | null = null;
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    if (
      last &&
      !isLast &&
      Math.hypot(p.x - last.x, p.y - last.y) < MIN_POINT_DISTANCE
    ) {
      return;
    }
    kept.push(i);
    last = p;
  });
  return kept;
};

const thinObject = (
  obj: DrawableObject
): { obj: DrawableObject; kept: number[] | null } => {
  if (obj.kind !== 'path') return { obj, kept: null };
  const kept = thinPathPoints(obj.points);
  const points = kept.map((i) => ({
    x: round1(obj.points[i].x),
    y: round1(obj.points[i].y),
  }));
  return { obj: { ...obj, points } satisfies PathObject, kept };
};

/** The object as the log stores it, so callers can compare live state against replay. */
export const toLoggedObject = (obj: DrawableObject): DrawableObject =>
  thinObject(obj).obj;

export interface WhiteboardLogRecorderOptions {
  startingPageId: string;
  budgetBytes?: number;
  onBudgetReached?: () => void;
  now?: () => number;
}

export interface PushOptions {
  /** Capture time of each path point on the recorder's clock, same length as `points`. */
  pointTimes?: number[];
}

export interface WhiteboardLogRecorder {
  start: (t0?: number) => void;
  push: (cmd: DrawingCommand, opts?: PushOptions) => void;
  undo: () => void;
  redo: () => void;
  readonly started: boolean;
  readonly bytes: number;
  readonly budgetReached: boolean;
  toLog: () => WhiteboardLog;
}

const headerBytes = (startingPageId: string) =>
  JSON.stringify({
    v: WHITEBOARD_LOG_VERSION,
    page: WHITEBOARD_PAGE,
    startingPageId,
    events: [],
  }).length;

export const createWhiteboardLogRecorder = ({
  startingPageId,
  budgetBytes = WHITEBOARD_LOG_BUDGET_BYTES,
  onBudgetReached,
  now = () => performance.now(),
}: WhiteboardLogRecorderOptions): WhiteboardLogRecorder => {
  let t0: number | null = null;
  let events: WhiteboardLogEvent[] = [];
  let lastT = 0;
  let bytes = headerBytes(startingPageId);
  let budgetReached = false;

  const record = (entry: WhiteboardLogEntry, at?: number) => {
    if (t0 === null) return;
    const raw = Math.round((at ?? now()) - t0);
    const t = Math.max(lastT, raw, 0);
    lastT = t;
    const event: WhiteboardLogEvent = { ...entry, t };
    events.push(event);
    bytes += JSON.stringify(event).length + 1;
    if (!budgetReached && bytes >= budgetBytes) {
      budgetReached = true;
      onBudgetReached?.();
    }
  };

  const recordDo = (cmd: WhiteboardLogCommand, at?: number) =>
    record({ op: 'do', cmd }, at);

  return {
    start: (startAt) => {
      t0 = startAt ?? now();
      events = [];
      lastT = 0;
      bytes = headerBytes(startingPageId);
      budgetReached = false;
    },
    push: (cmd, opts) => {
      switch (cmd.kind) {
        case 'add': {
          const { obj, kept } = thinObject(cmd.object);
          const times = opts?.pointTimes;
          if (
            kept &&
            times &&
            cmd.object.kind === 'path' &&
            times.length === cmd.object.points.length &&
            times.length > 0
          ) {
            const first = times[0];
            const pointTimes = kept.map((i) =>
              Math.max(0, Math.round(times[i] - first))
            );
            recordDo({ kind: 'add', object: obj, pointTimes }, first);
          } else {
            recordDo({ kind: 'add', object: obj });
          }
          return;
        }
        case 'remove':
          recordDo({ kind: 'remove', id: cmd.object.id });
          return;
        case 'update':
          recordDo({ kind: 'update', after: thinObject(cmd.after).obj });
          return;
        case 'reorder':
          recordDo({ kind: 'reorder', id: cmd.objectId, toZ: cmd.toZ });
          return;
        case 'clear':
          recordDo({ kind: 'clear' });
          return;
        case 'bulkRemove':
          recordDo({
            kind: 'bulkRemove',
            ids: cmd.objects.map((o) => o.id),
          });
          return;
      }
    },
    undo: () => record({ op: 'undo' }),
    redo: () => record({ op: 'redo' }),
    get started() {
      return t0 !== null;
    },
    get bytes() {
      return bytes;
    },
    get budgetReached() {
      return budgetReached;
    },
    toLog: () => ({
      v: WHITEBOARD_LOG_VERSION,
      page: WHITEBOARD_PAGE,
      startingPageId,
      events: [...events],
    }),
  };
};

const eventEnd = (e: WhiteboardLogEvent): number =>
  e.op === 'do' && e.cmd.kind === 'add' && e.cmd.pointTimes?.length
    ? e.t + e.cmd.pointTimes[e.cmd.pointTimes.length - 1]
    : e.t;

/** Time the last stroke finishes drawing, in ms from the start of the take. */
export const whiteboardLogDuration = (log: WhiteboardLog): number =>
  log.events.reduce((max, e) => Math.max(max, eventEnd(e)), 0);

// --- Replay ---

// Immutable linked stacks so checkpoints can share history without copying it.
type Stack = { cmd: DrawingCommand; rest: Stack } | null;

interface ReplayState {
  index: number;
  objects: DrawableObject[];
  past: Stack;
  future: Stack;
}

// Rebuilds the full DrawingCommand from the compact form against the replay's current objects.
const hydrate = (
  objects: readonly DrawableObject[],
  cmd: WhiteboardLogCommand
): DrawingCommand | null => {
  switch (cmd.kind) {
    case 'add':
      return { kind: 'add', object: cmd.object };
    case 'remove': {
      const object = objects.find((o) => o.id === cmd.id);
      return object ? { kind: 'remove', object } : null;
    }
    case 'update': {
      const before = objects.find((o) => o.id === cmd.after.id);
      return before ? { kind: 'update', before, after: cmd.after } : null;
    }
    case 'reorder': {
      const target = objects.find((o) => o.id === cmd.id);
      return target
        ? { kind: 'reorder', objectId: cmd.id, fromZ: target.z, toZ: cmd.toZ }
        : null;
    }
    case 'clear':
      return { kind: 'clear', objects: [...objects] };
    case 'bulkRemove': {
      const ids = new Set(cmd.ids);
      return {
        kind: 'bulkRemove',
        objects: objects.filter((o) => ids.has(o.id)),
      };
    }
  }
};

const step = (state: ReplayState, event: WhiteboardLogEvent): ReplayState => {
  const index = state.index + 1;
  if (event.op === 'undo') {
    if (!state.past) return { ...state, index };
    const last = state.past.cmd;
    return {
      index,
      objects: applyCommand(state.objects, last, 'reverse'),
      past: state.past.rest,
      future: { cmd: last, rest: state.future },
    };
  }
  if (event.op === 'redo') {
    if (!state.future) return { ...state, index };
    const next = state.future.cmd;
    return {
      index,
      objects: applyCommand(state.objects, next, 'forward'),
      past: { cmd: next, rest: state.past },
      future: state.future.rest,
    };
  }
  const full = hydrate(state.objects, event.cmd);
  if (!full) return { ...state, index };
  return {
    index,
    objects: applyCommand(state.objects, full, 'forward'),
    past: { cmd: full, rest: state.past },
    future: null,
  };
};

const CHECKPOINT_EVERY = 200;

export interface WhiteboardReplayer {
  /** Objects visible at `ms` into the take, including a partly drawn stroke. */
  seek: (ms: number) => DrawableObject[];
  readonly durationMs: number;
}

// Forward seeks continue from the last position; backward seeks restart from the nearest checkpoint.
export const createWhiteboardReplayer = (
  log: WhiteboardLog
): WhiteboardReplayer => {
  const { events } = log;
  const initial: ReplayState = {
    index: 0,
    objects: [],
    past: null,
    future: null,
  };
  const checkpoints: ReplayState[] = [initial];
  let cursor = initial;
  const durationMs = whiteboardLogDuration(log);

  const advanceTo = (ms: number) => {
    if (cursor.index > 0 && eventEnd(events[cursor.index - 1]) > ms) {
      let cp = initial;
      for (const c of checkpoints) {
        if (c.index === 0 || eventEnd(events[c.index - 1]) <= ms) cp = c;
        else break;
      }
      cursor = cp;
    }
    while (cursor.index < events.length) {
      const event = events[cursor.index];
      if (eventEnd(event) > ms) break;
      cursor = step(cursor, event);
      if (
        cursor.index % CHECKPOINT_EVERY === 0 &&
        checkpoints[checkpoints.length - 1].index < cursor.index
      ) {
        checkpoints.push(cursor);
      }
    }
  };

  return {
    durationMs,
    seek: (ms) => {
      advanceTo(ms);
      const pending = events[cursor.index];
      if (
        pending &&
        pending.t <= ms &&
        pending.op === 'do' &&
        pending.cmd.kind === 'add' &&
        pending.cmd.object.kind === 'path' &&
        pending.cmd.pointTimes
      ) {
        const elapsed = ms - pending.t;
        const pt = pending.cmd.pointTimes;
        const path = pending.cmd.object;
        const points = path.points.filter((_, i) => pt[i] <= elapsed);
        if (points.length > 0) {
          return [
            ...cursor.objects.filter((o) => o.id !== path.id),
            { ...path, points },
          ];
        }
      }
      return cursor.objects;
    },
  };
};

export const replayAt = (log: WhiteboardLog, ms: number): DrawableObject[] =>
  createWhiteboardReplayer(log).seek(ms);

// --- Serialize / parse ---

export const serializeWhiteboardLog = (log: WhiteboardLog): string =>
  JSON.stringify(log);

export class WhiteboardLogParseError extends Error {
  constructor(message: string) {
    super(`Invalid whiteboard log: ${message}`);
    this.name = 'WhiteboardLogParseError';
  }
}

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const optNum = (v: unknown) => v === undefined || isNum(v);
const optStr = (v: unknown) => v === undefined || isStr(v);

const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 10_000;

const isId = (v: unknown): v is string =>
  isStr(v) && v.length > 0 && v.length <= MAX_ID_LENGTH;

// Students cannot insert images (D8), so an image object in a log is rejected rather than rendered.
const isDrawableObject = (v: unknown): v is DrawableObject => {
  if (!isRec(v) || !isId(v.id) || !isNum(v.z) || !optNum(v.rotation)) {
    return false;
  }
  if (!optStr(v.authorUid)) return false;
  switch (v.kind) {
    case 'path':
      return (
        Array.isArray(v.points) &&
        v.points.every((p) => isRec(p) && isNum(p.x) && isNum(p.y)) &&
        isStr(v.color) &&
        isNum(v.width)
      );
    case 'rect':
    case 'ellipse':
      return (
        isNum(v.x) &&
        isNum(v.y) &&
        isNum(v.w) &&
        isNum(v.h) &&
        isStr(v.stroke) &&
        isNum(v.strokeWidth) &&
        optStr(v.fill)
      );
    case 'line':
    case 'arrow':
      return (
        isNum(v.x1) &&
        isNum(v.y1) &&
        isNum(v.x2) &&
        isNum(v.y2) &&
        isStr(v.stroke) &&
        isNum(v.strokeWidth)
      );
    case 'text':
      return (
        isNum(v.x) &&
        isNum(v.y) &&
        isNum(v.w) &&
        isNum(v.h) &&
        isStr(v.content) &&
        v.content.length <= MAX_TEXT_LENGTH &&
        isStr(v.fontFamily) &&
        isNum(v.fontSize) &&
        isStr(v.color) &&
        (v.wrap === undefined || typeof v.wrap === 'boolean')
      );
    default:
      return false;
  }
};

const parseCommand = (v: unknown): WhiteboardLogCommand | null => {
  if (!isRec(v)) return null;
  switch (v.kind) {
    case 'add': {
      if (!isDrawableObject(v.object)) return null;
      if (v.pointTimes === undefined) return { kind: 'add', object: v.object };
      const pt = v.pointTimes;
      if (
        v.object.kind !== 'path' ||
        !Array.isArray(pt) ||
        pt.length !== v.object.points.length ||
        !pt.every(
          (n, i, arr) => isNum(n) && n >= 0 && (i === 0 || n >= arr[i - 1])
        )
      ) {
        return null;
      }
      return { kind: 'add', object: v.object, pointTimes: pt as number[] };
    }
    case 'remove':
      return isId(v.id) ? { kind: 'remove', id: v.id } : null;
    case 'update':
      return isDrawableObject(v.after)
        ? { kind: 'update', after: v.after }
        : null;
    case 'reorder':
      return isId(v.id) && isNum(v.toZ)
        ? { kind: 'reorder', id: v.id, toZ: v.toZ }
        : null;
    case 'clear':
      return { kind: 'clear' };
    case 'bulkRemove':
      return Array.isArray(v.ids) && v.ids.every(isId)
        ? { kind: 'bulkRemove', ids: v.ids }
        : null;
    default:
      return null;
  }
};

const parseEvent = (e: unknown): WhiteboardLogEntry | null => {
  if (!isRec(e)) return null;
  if (e.op === 'undo' || e.op === 'redo') return { op: e.op };
  if (e.op !== 'do') return null;
  const cmd = parseCommand(e.cmd);
  return cmd ? { op: 'do', cmd } : null;
};

/** Parses JSON text or an already-decoded value; throws WhiteboardLogParseError when anything is off. */
export const parseWhiteboardLog = (input: unknown): WhiteboardLog => {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new WhiteboardLogParseError('not JSON');
    }
  }
  if (!isRec(data)) throw new WhiteboardLogParseError('not an object');
  if (data.v !== WHITEBOARD_LOG_VERSION) {
    throw new WhiteboardLogParseError(`unsupported version ${String(data.v)}`);
  }
  if (
    !isRec(data.page) ||
    data.page.w !== WHITEBOARD_PAGE.w ||
    data.page.h !== WHITEBOARD_PAGE.h
  ) {
    throw new WhiteboardLogParseError('page size');
  }
  if (!isStr(data.startingPageId)) {
    throw new WhiteboardLogParseError('startingPageId');
  }
  if (!Array.isArray(data.events)) throw new WhiteboardLogParseError('events');
  let lastT = 0;
  const events = data.events.map((e, i): WhiteboardLogEvent => {
    if (!isRec(e) || !isNum(e.t) || e.t < lastT) {
      throw new WhiteboardLogParseError(`event ${i} time`);
    }
    lastT = e.t;
    const entry = parseEvent(e);
    if (!entry) throw new WhiteboardLogParseError(`event ${i} command`);
    return { ...entry, t: e.t };
  });
  return {
    v: WHITEBOARD_LOG_VERSION,
    page: WHITEBOARD_PAGE,
    startingPageId: data.startingPageId,
    events,
  };
};
