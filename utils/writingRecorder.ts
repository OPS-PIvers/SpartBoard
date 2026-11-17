// The holding tab's Writing record: the edit log in chunks (D25) and the summary counts (D9), which keep counting past the log.
import type { WritingResponseSummary } from '@/types';
import {
  PAUSE_CAP_MS,
  SESSION_GAP_MS,
  WritingLogWriter,
  diffText,
  parseWritingLog,
  textAfter,
  utf8Length,
  type WritingEditKind,
} from '@/utils/writingLog';
import {
  WRITING_LOG_CHUNK_BYTES,
  WRITING_LOG_MAX_CHUNKS,
} from '@/utils/writingResponseState';

/** A chunk that filled up: written once with `closed: true`, then never again. */
export interface ClosedLogChunk {
  index: number;
  log: string;
}

export interface OpenLogChunk {
  index: number;
  log: string;
}

/** The open chunk from every chunk's log up to it: its start text is the earlier chunks replayed. */
export function openChunkFromLogs(logs: readonly string[]): {
  chunk: number;
  log: string;
  startText: string;
} {
  let text = '';
  const last = Math.max(0, logs.length - 1);
  for (let i = 0; i < last; i += 1) {
    const { edits } = parseWritingLog(logs[i], text.length);
    text = textAfter(edits, edits.length, text);
  }
  return { chunk: last, log: logs[last] ?? '', startText: text };
}

/** Room an edit's encoding needs beyond its text: kind, times, positions and a clock stamp. */
const EDIT_OVERHEAD = 48;

type Counts = Omit<WritingResponseSummary, 'wordCount' | 'savedAt'>;

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;

export function emptyWritingSummary(now: number): WritingResponseSummary {
  return {
    wordCount: 0,
    savedAt: now,
    writingMs: 0,
    sessions: 0,
    pasteCount: 0,
    pastedChars: 0,
    untypedCount: 0,
    untypedChars: 0,
    awayMs: 0,
    awayCount: 0,
  };
}

export class WritingRecorder {
  private writer: WritingLogWriter;
  private chunk: number;
  private closing: ClosedLogChunk[] = [];
  private counts: Counts;
  private baseSavedAt: number;
  private lastText: string | null = null;
  private lastT: number | null = null;
  private lastWall: number | null = null;
  private version = 0;
  private savedVersion = 0;
  private chunkBytes: number;

  constructor(opts: {
    log: string;
    startText: string;
    chunk: number;
    base: WritingResponseSummary | null | undefined;
    chunkBytes?: number;
  }) {
    this.chunk = opts.chunk;
    this.chunkBytes = opts.chunkBytes ?? WRITING_LOG_CHUNK_BYTES;
    this.writer = new WritingLogWriter(
      opts.log,
      opts.chunk > 0 ? opts.startText : undefined
    );
    const b = opts.base ?? emptyWritingSummary(0);
    this.baseSavedAt = num(b.savedAt);
    this.counts = {
      writingMs: num(b.writingMs),
      sessions: num(b.sessions),
      pasteCount: num(b.pasteCount),
      pastedChars: num(b.pastedChars),
      untypedCount: num(b.untypedCount),
      untypedChars: num(b.untypedChars),
      awayMs: num(b.awayMs),
      awayCount: num(b.awayCount),
      ...(typeof b.logStoppedAt === 'number'
        ? { logStoppedAt: b.logStoppedAt }
        : {}),
    };
  }

  /** Records `prev` becoming `next`; `t` is a page clock (ms) and `wall` the epoch time. */
  edit(
    prev: string,
    next: string,
    t: number,
    kind: Extract<WritingEditKind, 'typed' | 'pasted' | 'restored'>,
    wall: number
  ): void {
    const d = diffText(prev, next);
    if (!d) return;
    const c = this.counts;
    // Text that changed between events, with no typing or paste: an extension or dictation.
    if (this.lastText !== null && this.lastText !== prev) {
      const gap = diffText(this.lastText, prev);
      // Line breaks that a list or paragraph change moves are not text.
      if (gap && gap.ins.trim().length > 0) {
        c.untypedCount += 1;
        c.untypedChars += gap.ins.length;
      }
    }
    if (kind === 'pasted') {
      c.pasteCount += 1;
      c.pastedChars += d.ins.length;
    }
    if (this.lastT !== null)
      c.writingMs += Math.min(Math.max(0, t - this.lastT), PAUSE_CAP_MS);
    const lastSeen = this.lastWall ?? (this.baseSavedAt || null);
    if (
      c.sessions === 0 ||
      lastSeen === null ||
      wall - lastSeen >= SESSION_GAP_MS
    )
      c.sessions += 1;
    this.lastT = t;
    this.lastWall = wall;
    this.lastText = next;
    this.log(prev, next, d.ins, t, kind, wall);
  }

  /** Time away from the tab, counted once per return. */
  away(ms: number): void {
    this.counts.awayCount += 1;
    this.counts.awayMs += Math.max(0, Math.round(ms));
  }

  private log(
    prev: string,
    next: string,
    ins: string,
    t: number,
    kind: WritingEditKind,
    wall: number
  ): void {
    if (this.counts.logStoppedAt !== undefined) return;
    const need =
      utf8Length(ins) +
      EDIT_OVERHEAD +
      (this.writer.current === prev ? 0 : utf8Length(prev) + EDIT_OVERHEAD);
    // An edit no chunk could hold ends the log here; a later chunk could not replay past a cut.
    if (need > this.chunkBytes) {
      this.counts.logStoppedAt = wall;
      this.version += 1;
      return;
    }
    if (this.writer.size > 0 && this.writer.size + need > this.chunkBytes)
      if (!this.roll(this.writer.current, wall)) return;
    this.writer.write(
      prev,
      next,
      t,
      kind,
      this.chunkBytes - this.writer.size,
      wall
    );
    this.version += 1;
    if (this.writer.full) this.counts.logStoppedAt = wall;
  }

  /** Closes the open chunk and opens the next from `text`; false once the ten chunks are used (D25). */
  private roll(text: string, wall: number): boolean {
    if (this.chunk + 1 >= WRITING_LOG_MAX_CHUNKS) {
      this.counts.logStoppedAt = wall;
      this.version += 1;
      return false;
    }
    this.closing.push({ index: this.chunk, log: this.writer.value });
    this.chunk += 1;
    this.writer = new WritingLogWriter('', text);
    this.version += 1;
    return true;
  }

  /** The plain text as of the last edit, for an input that came with no beforeinput. */
  get text(): string {
    return this.lastText ?? this.writer.current;
  }

  get openChunk(): OpenLogChunk {
    return { index: this.chunk, log: this.writer.value };
  }

  /** The oldest full chunk still to be written closed, if any. */
  get nextClosing(): ClosedLogChunk | null {
    return this.closing[0] ?? null;
  }

  confirmClosed(index: number): void {
    if (this.closing[0]?.index === index) this.closing.shift();
  }

  /** A mark for what the log holds now; pass it back once a save that carried the log lands. */
  get logVersion(): number {
    return this.version;
  }

  get logDirty(): boolean {
    return this.savedVersion < this.version || this.closing.length > 0;
  }

  markLogSaved(version: number): void {
    this.savedVersion = Math.max(this.savedVersion, version);
  }

  get logBytes(): number {
    return this.writer.size;
  }

  summary(wordCount: number, now: number): WritingResponseSummary {
    return { ...this.counts, wordCount, savedAt: now };
  }
}
