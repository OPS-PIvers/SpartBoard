import type { DrawableObject } from '@/types';

/** The fixed logical page every whiteboard response is drawn on (RR-B4 sd-1/2). */
export const WHITEBOARD_PAGE = { w: 1600, h: 1200 } as const;
/** The bitmap is always 2x the logical page, never `devicePixelRatio` (RR-B4 sd-5). */
export const WHITEBOARD_BITMAP_SCALE = 2;
/** A log nearing this size ends the take as the time limit would (D14). */
export const WHITEBOARD_LOG_BUDGET_BYTES = 4 * 1024 * 1024;

/** A drawing command as logged: snapshots replay can rebuild from its own state are stored as ids (C1). */
export type WhiteboardLogCommand =
  /** `pointTimes`: ms offset of each path point from the event's `t`, so replay draws at the recorded pace. */
  | { kind: 'add'; object: DrawableObject; pointTimes?: number[] }
  | { kind: 'remove'; id: string }
  | { kind: 'update'; after: DrawableObject }
  | { kind: 'reorder'; id: string; toZ: number }
  | { kind: 'clear' }
  | { kind: 'bulkRemove'; ids: string[] };

/** What the log records at `t`: a drawing command, or an undo/redo of the latest one. */
export type WhiteboardLogEntry =
  { op: 'do'; cmd: WhiteboardLogCommand } | { op: 'undo' } | { op: 'redo' };

/** One log event; `t` is milliseconds since the take's clock started. */
export type WhiteboardLogEvent = WhiteboardLogEntry & { t: number };

/** The drawing log archived beside a whiteboard take's picture and audio (D14, D19). */
export interface WhiteboardLog {
  v: 1;
  page: typeof WHITEBOARD_PAGE;
  /** Stable id of the starting page the take began from; the log references it, never copies it (D7). */
  startingPageId: string;
  events: WhiteboardLogEvent[];
}
