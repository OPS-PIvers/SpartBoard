// Reads a Writing record (D9, D21, D25): the edit log across its chunks, draft marks, and each paste and untyped addition.
import type { WritingDraft, WritingResponseSummary } from '@/types';
import {
  parseWritingLog,
  textAfter,
  type ParsedWritingLog,
  type WritingEdit,
} from '@/utils/writingLog';

/** One chunk as stored at `.../log/{index}`. */
export interface WritingRecordChunk {
  index: number;
  log: string;
}

export interface JoinedWritingLog extends ParsedWritingLog {
  /** Edits before each chunk, by chunk index. */
  chunkStarts: number[];
}

const byIndex = (a: WritingRecordChunk, b: WritingRecordChunk) =>
  a.index - b.index;

/** One edit log from its chunks in order; each later chunk starts from the text the earlier ones end on. */
export function joinWritingLog(
  chunks: readonly WritingRecordChunk[]
): JoinedWritingLog {
  const out: JoinedWritingLog = {
    edits: [],
    stamps: [],
    cutOff: false,
    chunkStarts: [],
  };
  let text = '';
  for (const c of [...chunks].sort(byIndex)) {
    // A missing chunk would misplace every edit after it, so the log ends there.
    if (c.index !== out.chunkStarts.length) break;
    out.chunkStarts.push(out.edits.length);
    const parsed = parseWritingLog(c.log, text.length);
    const offset = out.edits.length;
    for (const s of parsed.stamps)
      out.stamps.push({ at: s.at + offset, time: s.time });
    for (const e of parsed.edits) out.edits.push(e);
    text = textAfter(parsed.edits, parsed.edits.length, text);
    if (parsed.cutOff) {
      out.cutOff = true;
      break;
    }
  }
  return out;
}

/** Where a frozen copy sits in the joined log: the count of edits made before it was turned in. */
export function draftMarkAt(
  joined: JoinedWritingLog,
  chunks: readonly WritingRecordChunk[],
  mark: WritingDraft['logMark'] | undefined
): number | null {
  if (!mark || !Number.isInteger(mark.chunk) || mark.chunk < 0) return null;
  const start = joined.chunkStarts[mark.chunk];
  if (start === undefined) return null;
  const chunk = chunks.find((c) => c.index === mark.chunk);
  if (!chunk) return null;
  const length = Math.max(0, Math.min(mark.length, chunk.log.length));
  const before = parseWritingLog(chunk.log.slice(0, length), 0).edits.length;
  return Math.min(start + before, joined.edits.length);
}

/** A paste, or text added without typing or pasting (an extension, dictation). */
export interface WritingRecordInsert {
  /** Edits before it, for jumping playback there. */
  at: number;
  text: string;
}

export interface WritingRecordInserts {
  pastes: WritingRecordInsert[];
  untyped: WritingRecordInsert[];
}

const isUntyped = (e: WritingEdit) =>
  e.kind === 'sync' && e.ins.trim().length > 0;

/** Every paste and untyped addition the log holds, in order. */
export function writingInserts(
  edits: readonly WritingEdit[]
): WritingRecordInserts {
  const out: WritingRecordInserts = { pastes: [], untyped: [] };
  edits.forEach((e, i) => {
    if (e.kind === 'pasted' && e.ins.length > 0)
      out.pastes.push({ at: i + 1, text: e.ins });
    else if (isUntyped(e)) out.untyped.push({ at: i + 1, text: e.ins });
  });
  return out;
}

/** D21: the yearly purge keeps only these tokens, so pastes and untyped text outlive the playback. */
export const isKeptAfterPurge = (token: string): boolean =>
  token[0] === 'P' || token[0] === 'S';

/** A purged chunk's pastes and untyped additions; their positions mean nothing once the typing is gone. */
export function purgedInserts(
  chunks: readonly WritingRecordChunk[]
): WritingRecordInserts {
  const edits = [...chunks]
    .sort(byIndex)
    .flatMap((c) => parseWritingLog(c.log, Number.MAX_SAFE_INTEGER / 2).edits);
  return writingInserts(edits);
}

/** What the Writing record shows: playback, or only the summary once the yearly purge took it. */
export type WritingRecordState =
  | { kind: 'empty' }
  | { kind: 'purged'; inserts: WritingRecordInserts }
  | {
      kind: 'playback';
      log: JoinedWritingLog;
      inserts: WritingRecordInserts;
      /** D25: the edit the log stopped at, when it filled up. */
      stoppedAt: number | null;
    };

export function readWritingRecord(
  chunks: readonly WritingRecordChunk[],
  facts: {
    summary: Pick<WritingResponseSummary, 'logStoppedAt'> | undefined;
    logPurgedAt?: number;
  }
): WritingRecordState {
  if (typeof facts.logPurgedAt === 'number')
    return { kind: 'purged', inserts: purgedInserts(chunks) };
  const log = joinWritingLog(chunks);
  if (log.edits.length === 0) return { kind: 'empty' };
  const stopped = log.cutOff || typeof facts.summary?.logStoppedAt === 'number';
  return {
    kind: 'playback',
    log,
    inserts: writingInserts(log.edits),
    stoppedAt: stopped ? log.edits.length : null,
  };
}
