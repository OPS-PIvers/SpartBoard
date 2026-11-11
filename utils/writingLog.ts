/** All the edit logs on one response share this many bytes, about 6,000 words of typing. */
export const WRITING_LOG_BUDGET = 200_000;
/** One answer's log can use the whole budget. */
export const WRITING_LOG_MAX = WRITING_LOG_BUDGET;

const encoder = new TextEncoder();
/** Size in Firestore, where a character can cost up to 3 bytes. */
export const utf8Length = (s: string): number => encoder.encode(s).length;
const END_MARK = '!';

export type WritingEditKind = 'typed' | 'pasted' | 'sync';

export interface WritingEdit {
  /** Ms since the edit before it. */
  dt: number;
  pos: number;
  /** Characters removed at `pos`. */
  del: number;
  /** Text put in at `pos`. */
  ins: string;
  /** `sync` is text that changed with no typing or paste event, such as an answer restored on reload. */
  kind: WritingEditKind;
}

const isHigh = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/** The single splice that turns `prev` into `next`, or null when they match. */
export function diffText(
  prev: string,
  next: string
): Pick<WritingEdit, 'pos' | 'del' | 'ins'> | null {
  if (prev === next) return null;
  const max = Math.min(prev.length, next.length);
  let start = 0;
  while (start < max && prev.charCodeAt(start) === next.charCodeAt(start))
    start += 1;
  // Never split an emoji: Firestore refuses half of a surrogate pair.
  if (start > 0 && isHigh(prev.charCodeAt(start - 1))) start -= 1;
  let end = 0;
  while (
    end < max - start &&
    prev.charCodeAt(prev.length - 1 - end) ===
      next.charCodeAt(next.length - 1 - end)
  )
    end += 1;
  if (end > 0 && isLow(prev.charCodeAt(prev.length - end))) end -= 1;
  return {
    pos: start,
    del: prev.length - start - end,
    ins: next.slice(start, next.length - end),
  };
}

const KIND_MARK: Record<WritingEditKind, string> = {
  typed: '',
  pasted: 'P',
  sync: 'S',
};
const escapeText = (s: string) =>
  s.replace(
    /[%,;!:]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
const unescapeText = (s: string) =>
  s.replace(/%(25|2C|3B|21|3A)/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );

/** One edit as text. `cursor` is where the edit before it left off; a position equal to it is left out. */
export function encodeEdit(e: WritingEdit, cursor: number): string {
  const dt = Math.max(0, Math.round(e.dt)).toString(36);
  const pos = e.pos === cursor ? '' : e.pos.toString(36);
  const del = e.del > 0 ? e.del.toString(36) : '';
  // Plain typing at the cursor is most of a log, so it gets the short form.
  if (e.kind === 'typed' && pos === '' && del === '')
    return `${dt}:${escapeText(e.ins)}`;
  return `${KIND_MARK[e.kind]}${dt},${pos},${del},${escapeText(e.ins)}`;
}

export interface ParsedWritingLog {
  edits: WritingEdit[];
  /** Recording stopped at the size limit, so the log ends before the answer does. */
  cutOff: boolean;
}

const fromBase36 = (s: string): number | null => {
  if (!/^[0-9a-z]{1,8}$/.test(s)) return null;
  return parseInt(s, 36);
};

/** Reads a log a student's browser wrote; anything malformed is skipped. */
export function parseWritingLog(log: unknown): ParsedWritingLog {
  const out: ParsedWritingLog = { edits: [], cutOff: false };
  if (typeof log !== 'string' || log.length > WRITING_LOG_MAX + 64) return out;
  let cursor = 0;
  let length = 0;
  for (const token of log.split(';')) {
    if (token === END_MARK) {
      out.cutOff = true;
      break;
    }
    const kind: WritingEditKind =
      token[0] === 'P' ? 'pasted' : token[0] === 'S' ? 'sync' : 'typed';
    const body = kind === 'typed' ? token : token.slice(1);
    const short = /^([0-9a-z]+):(.*)$/s.exec(body);
    const parts = short ? [short[1], '', '', short[2]] : body.split(',');
    if (parts.length !== 4) continue;
    const dt = fromBase36(parts[0]);
    const rawPos = parts[1] === '' ? cursor : fromBase36(parts[1]);
    const rawDel = parts[2] === '' ? 0 : fromBase36(parts[2]);
    if (dt === null || rawPos === null || rawDel === null) continue;
    const pos = Math.min(rawPos, length);
    const del = Math.min(rawDel, length - pos);
    const ins = unescapeText(parts[3]);
    if (del === 0 && ins === '') continue;
    out.edits.push({ dt, pos, del, ins, kind });
    length += ins.length - del;
    cursor = pos + ins.length;
  }
  return out;
}

export const applyEdit = (text: string, e: WritingEdit): string =>
  text.slice(0, e.pos) + e.ins + text.slice(e.pos + e.del);

/** The text after the first `count` edits. */
export function textAfter(edits: WritingEdit[], count: number): string {
  let text = '';
  for (let i = 0; i < count && i < edits.length; i += 1)
    text = applyEdit(text, edits[i]);
  return text;
}

const CHECKPOINT_EVERY = 250;

/** Snapshots of the text every few hundred edits, so playback can jump anywhere in a long log. */
export function buildCheckpoints(edits: WritingEdit[]): string[] {
  const out = [''];
  let text = '';
  edits.forEach((e, i) => {
    text = applyEdit(text, e);
    if ((i + 1) % CHECKPOINT_EVERY === 0) out.push(text);
  });
  return out;
}

/** The text after the first `count` edits, from the nearest snapshot. */
export function textAt(
  edits: WritingEdit[],
  checkpoints: string[],
  count: number
): string {
  const n = Math.max(0, Math.min(count, edits.length));
  const at = Math.min(Math.floor(n / CHECKPOINT_EVERY), checkpoints.length - 1);
  let text = checkpoints[at];
  for (let i = at * CHECKPOINT_EVERY; i < n; i += 1)
    text = applyEdit(text, edits[i]);
  return text;
}

/** Appends edits to one question's log and tracks where it left off. */
export class WritingLogWriter {
  private text: string;
  private cursor: number;
  private lastT: number | null = null;
  private closed: boolean;
  private log: string;
  private bytes: number;

  constructor(base: string | undefined) {
    const parsed = parseWritingLog(base);
    this.log = parsed.edits.length > 0 && base ? base : '';
    this.closed = parsed.cutOff;
    this.bytes = utf8Length(this.log);
    this.text = textAfter(parsed.edits, parsed.edits.length);
    const last = parsed.edits[parsed.edits.length - 1];
    this.cursor = last ? last.pos + last.ins.length : 0;
  }

  get value(): string {
    return this.log;
  }

  get size(): number {
    return this.bytes;
  }

  /** Records `prev` becoming `next`; returns the bytes added to the log. `room` is what the shared budget has left. */
  write(
    prev: string,
    next: string,
    t: number,
    kind: WritingEditKind,
    room: number
  ): number {
    if (this.closed) return 0;
    const before = this.bytes;
    const dt = this.lastT === null ? 0 : Math.min(t - this.lastT, 86_400_000);
    // The box held something the log never saw: a reload, or text set by a script.
    if (this.text !== prev) this.push(this.text, prev, 0, 'sync');
    this.push(prev, next, dt, kind);
    this.lastT = t;
    if (this.bytes > WRITING_LOG_MAX || this.bytes - before > room) {
      this.append(END_MARK);
      this.closed = true;
    }
    return this.bytes - before;
  }

  private append(token: string): void {
    const piece = this.log ? `;${token}` : token;
    this.log += piece;
    this.bytes += utf8Length(piece);
  }

  private push(
    from: string,
    to: string,
    dt: number,
    kind: WritingEditKind
  ): void {
    const d = diffText(from, to);
    if (!d) return;
    this.append(encodeEdit({ ...d, dt, kind }, this.cursor));
    this.text = to;
    this.cursor = d.pos + d.ins.length;
  }
}

export interface WritingSummary {
  /** Typed or pasted edits. */
  edits: number;
  /** Edits that removed text. */
  deletions: number;
  deletedChars: number;
  /** Edits that added text somewhere other than the end. */
  insertsInside: number;
  pastedChars: number;
  /** Characters that appeared with no typing or paste event. */
  syncChars: number;
  /** Time spent writing, counting no more than `PAUSE_CAP_MS` for any one pause. */
  writingMs: number;
  finalText: string;
}

/** Pauses longer than this count as this long, in the summary and in playback. */
export const PAUSE_CAP_MS = 2000;

export function summarizeWriting(edits: WritingEdit[]): WritingSummary {
  const s: WritingSummary = {
    edits: 0,
    deletions: 0,
    deletedChars: 0,
    insertsInside: 0,
    pastedChars: 0,
    syncChars: 0,
    writingMs: 0,
    finalText: '',
  };
  for (const e of edits) {
    const before = s.finalText;
    s.finalText = applyEdit(before, e);
    if (e.kind === 'sync') {
      s.syncChars += e.ins.length;
      continue;
    }
    s.edits += 1;
    s.writingMs += Math.min(e.dt, PAUSE_CAP_MS);
    if (e.kind === 'pasted') s.pastedChars += e.ins.length;
    if (e.del > 0) {
      s.deletions += 1;
      s.deletedChars += e.del;
    } else if (e.pos < before.trimEnd().length) {
      s.insertsInside += 1;
    }
  }
  return s;
}
