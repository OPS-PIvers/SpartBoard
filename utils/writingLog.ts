const oneBreak = (s: string) => s.replace(/\n+/g, '\n');

/** All the edit logs on one response share this many bytes, about 6,000 words of typing. */
export const WRITING_LOG_BUDGET = 200_000;
/** One answer's log can use the whole budget. */
export const WRITING_LOG_MAX = WRITING_LOG_BUDGET;

const encoder = new TextEncoder();
/** Size in Firestore, where a character can cost up to 3 bytes. */
export const utf8Length = (s: string): number => encoder.encode(s).length;
const END_MARK = '!';

export type WritingEditKind =
  'typed' | 'pasted' | 'dictated' | 'sync' | 'restored' | 'format' | 'peer';

export interface WritingEdit {
  /** Ms since the edit before it. */
  dt: number;
  pos: number;
  /** Characters removed at `pos`. */
  del: number;
  /** Text put in at `pos`. */
  ins: string;
  /** `restored` is text already in the box when the page loaded; `sync` is text that changed mid-page with no typing or paste event; `format` re-spaces line breaks from an older recorder. */
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
  dictated: 'D',
  sync: 'S',
  restored: 'R',
  format: 'F',
  peer: 'V',
};
const KIND_BY_MARK = new Map(
  Object.entries(KIND_MARK)
    .filter(([, m]) => m !== '')
    .map(([k, m]) => [m, k as WritingEditKind])
);
const escapeText = (s: string) =>
  s.replace(
    /[%,;!:]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
/** Bytes `s` takes in a log once escaped. */
export const encodedLength = (s: string): number => utf8Length(escapeText(s));
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

/** Clock time the student was writing at, logged when writing starts or resumes. */
export interface WritingStamp {
  /** Edits before the stamp. */
  at: number;
  /** Epoch ms, to the second. */
  time: number;
}

/** No typing for this long starts a new writing session. */
export const SESSION_GAP_MS = 15 * 60_000;

export interface ParsedWritingLog {
  edits: WritingEdit[];
  stamps: WritingStamp[];
  /** Recording stopped at the size limit, so the log ends before the answer does. */
  cutOff: boolean;
}

const fromBase36 = (s: string): number | null => {
  if (!/^[0-9a-z]{1,8}$/.test(s)) return null;
  return parseInt(s, 36);
};

/** Reads a log a student's browser wrote; anything malformed is skipped. `startLength` is the text's length before a later chunk. */
export function parseWritingLog(
  log: unknown,
  startLength = 0
): ParsedWritingLog {
  const out: ParsedWritingLog = { edits: [], stamps: [], cutOff: false };
  if (typeof log !== 'string' || log.length > WRITING_LOG_MAX + 64) return out;
  let cursor = 0;
  let length = startLength;
  for (const token of log.split(';')) {
    if (token === END_MARK) {
      out.cutOff = true;
      break;
    }
    if (token[0] === 'T') {
      const sec = fromBase36(token.slice(1));
      if (sec !== null)
        out.stamps.push({ at: out.edits.length, time: sec * 1000 });
      continue;
    }
    const mark = /^[A-Z]/.test(token) ? token[0] : '';
    // A mark from a newer recorder still moves the text; it reads as text that changed with no typing.
    const kind: WritingEditKind =
      mark === '' ? 'typed' : (KIND_BY_MARK.get(mark) ?? 'sync');
    const body = mark === '' ? token : token.slice(1);
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
export function textAfter(
  edits: WritingEdit[],
  count: number,
  start = ''
): string {
  let text = start;
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
  private lastWall: number | null = null;
  private closed: boolean;
  private log: string;
  private bytes: number;
  private started = false;
  /** The base log came from the recorder that doubled paragraph breaks. */
  private legacy: boolean;

  /** `startText` is the text a later chunk of one log starts from; its first edit always names its position. */
  constructor(base: string | undefined, startText?: string) {
    const parsed = parseWritingLog(base, startText?.length ?? 0);
    this.log = parsed.edits.length > 0 && base ? base : '';
    this.closed = parsed.cutOff;
    this.legacy = parsed.edits.length > 0 && parsed.stamps.length === 0;
    this.bytes = utf8Length(this.log);
    this.text = textAfter(parsed.edits, parsed.edits.length, startText);
    const last = parsed.edits[parsed.edits.length - 1];
    this.cursor = last
      ? last.pos + last.ins.length
      : startText !== undefined
        ? -1
        : 0;
  }

  /** A chunk that continues a log mid-page: text it never saw is untyped, not restored. */
  continueLive(): void {
    this.started = true;
  }

  /** The text the log has reached. */
  get current(): string {
    return this.text;
  }

  get full(): boolean {
    return this.closed;
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
    room: number,
    wall = Date.now()
  ): number {
    if (this.closed) return 0;
    const before = this.bytes;
    const beforeLog = this.log;
    const dt = this.lastT === null ? 0 : Math.min(t - this.lastT, 86_400_000);
    // Clock time on each page load and after a long break, so sessions survive a tab left open or a sleeping laptop.
    if (this.lastWall === null || wall - this.lastWall >= SESSION_GAP_MS)
      this.append(`T${Math.floor(wall / 1000).toString(36)}`);
    this.lastWall = wall;
    // The box held something the log never saw: edits lost to a reload, or text set by a script.
    if (this.text !== prev)
      this.push(
        this.text,
        prev,
        0,
        this.started
          ? 'sync'
          : this.legacy && oneBreak(this.text) === oneBreak(prev)
            ? 'format'
            : 'restored'
      );
    this.started = true;
    this.push(prev, next, dt, kind);
    this.lastT = t;
    if (this.bytes > WRITING_LOG_MAX || this.bytes - before > room) {
      // Drop the edit that broke the budget so one huge paste can't bloat the response doc.
      this.log = beforeLog;
      this.bytes = before;
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
  /** Typed, pasted or dictated edits. */
  edits: number;
  /** Edits that removed text. */
  deletions: number;
  deletedChars: number;
  /** Whole words swapped for a different word earlier in the text; typo fixes and plain additions or cuts don't count. */
  wordsReplaced: number;
  pastedChars: number;
  /** Characters spoken with Speech to text. */
  dictatedChars: number;
  /** Characters that appeared mid-page with no typing or paste event. */
  syncChars: number;
  /** Characters already in the box after a page reload that the log had not saved. */
  restoredChars: number;
  /** Time spent writing, counting no more than `PAUSE_CAP_MS` for any one pause. */
  writingMs: number;
  finalText: string;
}

/** Pauses longer than this count as this long, in the summary and in playback. */
export const PAUSE_CAP_MS = 2000;

/** A gap this long ends one stretch of editing. */
const BURST_GAP_MS = 30_000;

const wordsOf = (text: string): string[] =>
  text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** Whether two words are within `max` single-letter adds, cuts, changes or swapped neighbours; banded, so a long word costs O(length × max). */
export function withinEdits(a: string, b: string, max: number): boolean {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > max) return false;
  const big = max + 1;
  const rows = [0, 1, 2].map(() => new Int32Array(m + 1).fill(big));
  for (let j = 0; j <= Math.min(m, max); j += 1) rows[0][j] = j;
  let prevBest = 0;
  for (let i = 1; i <= n; i += 1) {
    const cur = rows[i % 3];
    const prev = rows[(i - 1) % 3];
    const prev2 = rows[(i + 1) % 3];
    const lo = Math.max(1, i - max);
    const hi = Math.min(m, i + max);
    cur[lo - 1] = lo === 1 && i <= max ? i : big;
    if (hi + 1 <= m) cur[hi + 1] = big;
    let best = cur[lo - 1];
    for (let j = lo; j <= hi; j += 1) {
      let v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = Math.min(v, big);
      if (cur[j] < best) best = cur[j];
    }
    // A swap can skip one row, so give up only after two rows past the limit.
    if (best > max && prevBest > max) return false;
    prevBest = best;
  }
  return rows[n % 3][m] <= max;
}

/** A typo fix: 1 letter off, or 2 in a word of 6 or more. */
const isTypoFix = (a: string, b: string) =>
  withinEdits(a, b, Math.max(a.length, b.length) >= 6 ? 2 : 1);

/** Typo comparisons one summary may make; past it, remaining words count as replaced. */
const TYPO_CHECK_BUDGET = 20_000;
/** Characters of text one summary may scan for replaced words; past it, later bursts are not counted. */
const WORD_SCAN_BUDGET = 4_000_000;

/** Work left for one summary, shared by every burst so a log of many bursts stays bounded. */
interface WordBudget {
  typoChecks: number;
  scanChars: number;
}

/** Words in `before` swapped for a different word in `after`, leaving out typo fixes. */
export function replacedWords(
  before: string,
  after: string,
  budget: WordBudget = {
    typoChecks: TYPO_CHECK_BUDGET,
    scanChars: WORD_SCAN_BUDGET,
  }
): number {
  budget.scanChars -= before.length + after.length;
  if (budget.scanChars < 0) return 0;
  const left = new Map<string, number>();
  for (const w of wordsOf(before)) left.set(w, (left.get(w) ?? 0) + 1);
  const added: string[] = [];
  for (const w of wordsOf(after)) {
    const n = left.get(w) ?? 0;
    if (n > 0) left.set(w, n - 1);
    else added.push(w);
  }
  const removed = [...left].flatMap(([w, n]) => Array<string>(n).fill(w));
  // Removed words by length; a typo fix is never more than 2 letters longer or shorter.
  const byLength = new Map<number, number[]>();
  removed.forEach((w, i) => {
    const list = byLength.get(w.length);
    if (list) list.push(i);
    else byLength.set(w.length, [i]);
  });
  let fresh = 0;
  let matched = 0;
  for (const w of added) {
    let hit: { list: number[]; at: number } | null = null;
    for (
      let len = w.length - 2;
      len <= w.length + 2 && budget.typoChecks > 0;
      len += 1
    ) {
      const list = byLength.get(len);
      if (!list) continue;
      for (let k = 0; k < list.length && budget.typoChecks > 0; k += 1) {
        if (hit && list[k] > hit.list[hit.at]) break;
        budget.typoChecks -= 1;
        if (isTypoFix(removed[list[k]], w)) {
          hit = { list, at: k };
          break;
        }
      }
    }
    if (hit) {
      hit.list.splice(hit.at, 1);
      matched += 1;
    } else fresh += 1;
  }
  return Math.min(fresh, removed.length - matched);
}

export function summarizeWriting(edits: WritingEdit[]): WritingSummary {
  const s: WritingSummary = {
    edits: 0,
    deletions: 0,
    deletedChars: 0,
    wordsReplaced: 0,
    pastedChars: 0,
    dictatedChars: 0,
    syncChars: 0,
    restoredChars: 0,
    writingMs: 0,
    finalText: '',
  };
  // One stretch of editing earlier in the text: where it started and the text before it.
  let burst: { before: string; caret: number } | null = null;
  const budget: WordBudget = {
    typoChecks: TYPO_CHECK_BUDGET,
    scanChars: WORD_SCAN_BUDGET,
  };
  const closeBurst = () => {
    if (burst)
      s.wordsReplaced += replacedWords(burst.before, s.finalText, budget);
    burst = null;
  };
  for (const e of edits) {
    const before = s.finalText;
    if (
      e.kind === 'sync' ||
      e.kind === 'restored' ||
      e.kind === 'format' ||
      e.kind === 'peer'
    ) {
      closeBurst();
      s.finalText = applyEdit(before, e);
      // A partner's accepted edit is not the writer's own typing.
      if (e.kind !== 'format' && e.kind !== 'peer')
        s[e.kind === 'sync' ? 'syncChars' : 'restoredChars'] += e.ins.length;
      continue;
    }
    const continues =
      burst !== null &&
      e.dt < BURST_GAP_MS &&
      (e.pos === burst.caret || e.pos + e.del === burst.caret);
    if (!continues) {
      closeBurst();
      if (e.pos + e.del < before.trimEnd().length) burst = { before, caret: 0 };
    }
    s.finalText = applyEdit(before, e);
    if (burst) burst.caret = e.pos + e.ins.length;
    s.edits += 1;
    s.writingMs += Math.min(e.dt, PAUSE_CAP_MS);
    if (e.kind === 'pasted') s.pastedChars += e.ins.length;
    if (e.kind === 'dictated') s.dictatedChars += e.ins.length;
    if (e.del > 0) {
      s.deletions += 1;
      s.deletedChars += e.del;
    }
  }
  closeBurst();
  return s;
}

export interface WritingSession {
  /** Index of the session's first edit. */
  at: number;
  start: number;
  end: number;
}

/** Writing sessions from a log's clock stamps; a reload within `SESSION_GAP_MS` continues the session. Empty for logs with no stamps. */
export function writingSessions(
  edits: WritingEdit[],
  stamps: WritingStamp[]
): WritingSession[] {
  const out: WritingSession[] = [];
  // Writing from before stamps has no clock time, so sessions would misdate it.
  if (stamps.length === 0 || stamps[0].at > 0) return out;
  stamps.forEach((stamp, i) => {
    const until = stamps[i + 1]?.at ?? edits.length;
    let end = stamp.time;
    for (let k = stamp.at + 1; k < until; k += 1) end += edits[k].dt;
    const last = out[out.length - 1];
    if (last && stamp.time - last.end < SESSION_GAP_MS)
      last.end = Math.max(last.end, end);
    else if (stamp.at < edits.length || !last)
      out.push({ at: stamp.at, start: stamp.time, end });
  });
  return out;
}
