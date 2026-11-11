import type {
  InputSignalCounts,
  InputSignals,
  QuizQuestion,
  QuizResponseAnswer,
} from '@/types';
import {
  WRITING_LOG_BUDGET,
  WRITING_LOG_MAX,
  WritingLogWriter,
  diffText,
} from '@/utils/writingLog';

/** Global feature that gates recording and showing input signals. */
export const INPUT_SIGNALS_FEATURE = 'input-signals' as const;

const COUNT_KEYS = [
  'clicks',
  'jumpClicks',
  'lineClicks',
  'keys',
  'instantKeys',
  'ikN',
  'ikSum',
  'ikSq',
  'chars',
  'unkeyedChars',
  'pastes',
  'pastedChars',
  'scripted',
  'dels',
  'delChars',
  'midInserts',
  'ms',
  'panelOpens',
  'extraScreen',
] as const satisfies readonly (keyof InputSignalCounts)[];

/** A click this far from the last one, in px, has to have travelled. */
const JUMP_MIN_PX = 60;
const JUMP_MAX_MOVES = 2;
const LINE_MIN_PX = 100;
const LINE_MIN_MOVES = 8;
const LINE_MAX_STRETCH = 1.02;
const LINE_MAX_STEP_CV = 0.15;
/** A finger can't press and release a key this fast. */
const INSTANT_KEY_MS = 10;
const GAP_MAX_MS = 2000;
/** Text counts as typed when a key press came this recently. */
const KEYED_WINDOW_MS = 1000;
const PASTE_WINDOW_MS = 150;

/** Counters are filed under the question's id; this key holds any taken with no question on screen. */
const NO_QUESTION = '_';
const QUESTION_KEY = /^[\w-]{1,64}$/;

type Counts = Required<Omit<InputSignalCounts, 'log'>>;
const emptyCounts = (): Counts => ({
  clicks: 0,
  jumpClicks: 0,
  lineClicks: 0,
  keys: 0,
  instantKeys: 0,
  ikN: 0,
  ikSum: 0,
  ikSq: 0,
  chars: 0,
  unkeyedChars: 0,
  pastes: 0,
  pastedChars: 0,
  scripted: 0,
  dels: 0,
  delChars: 0,
  midInserts: 0,
  ms: 0,
  panelOpens: 0,
  extraScreen: 0,
});

const cv = (n: number, sum: number, sq: number): number => {
  if (n < 2 || sum <= 0) return Infinity;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean)) / mean;
};

export interface KeyDownInfo {
  code: string;
  /** Event time in ms. */
  t: number;
  /** A printable key with no shortcut modifier, not auto-repeated. */
  char: boolean;
  /** The answer box, so a gap is only measured inside one box. */
  field: unknown;
}

export interface CollectorOptions {
  /** Edit logs an earlier page load saved for this attempt, by question id. */
  logs?: Record<string, string>;
  /** Log characters this attempt may still add to the response. */
  logRoom?: number;
}

/** Turns raw pointer, key and text events into per-question counters; holds no DOM references. */
export class InputSignalCollector {
  private byQuestion = new Map<string, Counts>();
  private question = NO_QUESTION;
  private dirty = false;

  private px: number | null = null;
  private py = 0;
  private downX: number | null = null;
  private downY = 0;
  private moves = 0;
  private path = 0;
  private stepSq = 0;

  private lastKeyAt: number | null = null;
  private lastCharAt: number | null = null;
  private lastField: unknown = null;
  private down = new Map<string, number>();
  private pasteUntil = 0;
  private pasteLen = 0;

  private fieldText = new WeakMap<object, string>();
  private writers = new Map<string, WritingLogWriter>();
  private baseLogs: Record<string, string>;
  private logRoom: number;
  private activeSince: number | null = null;

  /** `finePointer` is false on phones and tablets, where on-screen keyboards make key timing meaningless. */
  constructor(
    private finePointer: boolean,
    options: CollectorOptions = {}
  ) {
    this.baseLogs = options.logs ?? {};
    this.logRoom = options.logRoom ?? WRITING_LOG_BUDGET;
  }

  /** `t` closes the time counted for the question being left. */
  setQuestion(id: string | undefined, t?: number): void {
    if (t !== undefined) this.clock(t, this.activeSince !== null);
    this.question = id && QUESTION_KEY.test(id) ? id : NO_QUESTION;
  }

  /** Adds the time since the last call to the question on screen; `active` is whether the page is visible now. */
  clock(t: number, active: boolean): void {
    if (this.activeSince !== null && t > this.activeSince) {
      // Time alone is saved with the next real event, never on its own.
      const wasDirty = this.dirty;
      this.bucket().ms += t - this.activeSince;
      this.dirty = wasDirty;
    }
    this.activeSince = active ? t : null;
  }

  /** What an answer box holds before an edit lands. */
  primeText(field: object, text: string): void {
    this.fieldText.set(field, text);
  }

  /** An answer box changed. `log` keeps the edit for playback; `composing` edits rewrite text as part of typing it. */
  textEdit(
    field: object,
    text: string,
    t: number,
    kind: 'typed' | 'pasted',
    options: { log: boolean; composing: boolean }
  ): void {
    const prev = this.fieldText.get(field);
    this.fieldText.set(field, text);
    if (prev === undefined) return;
    const d = diffText(prev, text);
    if (!d) return;
    const c = this.bucket();
    if (!options.composing) {
      if (d.del > 0) {
        c.dels += 1;
        c.delChars += d.del;
      } else if (prev.slice(d.pos).trim() !== '') {
        c.midInserts += 1;
      }
    }
    if (!options.log || this.question === NO_QUESTION) return;
    let writer = this.writers.get(this.question);
    if (!writer) {
      writer = new WritingLogWriter(this.baseLogs[this.question]);
      this.writers.set(this.question, writer);
    }
    this.logRoom -= writer.write(prev, text, t, kind, this.logRoom);
  }

  panelOpened(): void {
    this.bucket().panelOpens += 1;
  }

  extraScreen(): void {
    this.bucket().extraScreen += 1;
  }

  private bucket(): Counts {
    let c = this.byQuestion.get(this.question);
    if (!c) {
      c = emptyCounts();
      this.byQuestion.set(this.question, c);
    }
    this.dirty = true;
    return c;
  }

  pointerMove(x: number, y: number): void {
    if (this.px !== null) {
      const step = Math.hypot(x - this.px, y - this.py);
      if (step > 0) {
        this.moves += 1;
        this.path += step;
        this.stepSq += step * step;
      }
    }
    this.px = x;
    this.py = y;
  }

  pointerDown(x: number, y: number): void {
    this.pointerMove(x, y);
    const c = this.bucket();
    c.clicks += 1;
    if (this.downX !== null) {
      const far = Math.hypot(x - this.downX, y - this.downY);
      if (far >= JUMP_MIN_PX && this.moves <= JUMP_MAX_MOVES) {
        c.jumpClicks += 1;
      } else if (
        far >= LINE_MIN_PX &&
        this.moves >= LINE_MIN_MOVES &&
        this.path / far <= LINE_MAX_STRETCH &&
        cv(this.moves, this.path, this.stepSq) <= LINE_MAX_STEP_CV
      ) {
        c.lineClicks += 1;
      }
    }
    this.downX = x;
    this.downY = y;
    this.moves = 0;
    this.path = 0;
    this.stepSq = 0;
  }

  keyDown(k: KeyDownInfo): void {
    this.lastKeyAt = k.t;
    if (!k.char) return;
    const c = this.bucket();
    c.keys += 1;
    if (this.lastCharAt !== null && this.lastField === k.field) {
      const gap = k.t - this.lastCharAt;
      if (gap >= 0 && gap < GAP_MAX_MS) {
        c.ikN += 1;
        c.ikSum += gap;
        c.ikSq += gap * gap;
      }
    }
    this.lastCharAt = k.t;
    this.lastField = k.field;
    this.down.set(k.code, k.t);
  }

  keyUp(code: string, t: number): void {
    const at = this.down.get(code);
    if (at === undefined) return;
    this.down.delete(code);
    if (this.finePointer && t - at < INSTANT_KEY_MS)
      this.bucket().instantKeys += 1;
  }

  /** A paste or drop was tried; `len` is the text it carried. */
  paste(len: number, t: number): void {
    this.bucket().pastes += 1;
    this.pasteUntil = t + PASTE_WINDOW_MS;
    this.pasteLen = len;
  }

  /** Text landed in an answer box. `len` is null when the browser doesn't say how much. */
  textInput(
    len: number | null,
    t: number,
    kind: 'typed' | 'composed' | 'pasted'
  ): void {
    if (kind === 'pasted' || t <= this.pasteUntil) {
      const n = len ?? this.pasteLen;
      if (n > 0) this.bucket().pastedChars += n;
      this.pasteUntil = 0;
      return;
    }
    if (!len) return;
    const c = this.bucket();
    c.chars += len;
    const keyed =
      this.lastKeyAt !== null && t - this.lastKeyAt <= KEYED_WINDOW_MS;
    if (this.finePointer && kind === 'typed' && !keyed) c.unkeyedChars += len;
  }

  scripted(): void {
    this.bucket().scripted += 1;
  }

  /** True once since the last call if anything was counted. */
  takeDirty(): boolean {
    const was = this.dirty;
    this.dirty = false;
    return was;
  }

  snapshot(): Record<string, InputSignalCounts> {
    const out: Record<string, InputSignalCounts> = {};
    for (const [q, c] of this.byQuestion) out[q] = compact(c);
    for (const [q, w] of this.writers)
      if (w.value) out[q] = { ...out[q], log: w.value };
    return out;
  }
}

const compact = (c: InputSignalCounts): InputSignalCounts => {
  const out: InputSignalCounts = {};
  for (const k of COUNT_KEYS) {
    const v = c[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0)
      out[k] = Math.round(v);
  }
  if (
    typeof c.log === 'string' &&
    c.log &&
    c.log.length <= WRITING_LOG_MAX + 64
  )
    out.log = c.log;
  return out;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** One attempt's counters as read from Firestore; a student wrote them, so nothing is trusted. */
export function readAttemptSignals(
  signals: unknown,
  attempt: number | string
): Record<string, InputSignalCounts> {
  const raw = isRecord(signals) ? signals[String(attempt)] : undefined;
  if (!isRecord(raw)) return {};
  const out: Record<string, InputSignalCounts> = {};
  for (const [q, counts] of Object.entries(raw)) {
    if (!QUESTION_KEY.test(q) || !isRecord(counts)) continue;
    out[q] = compact(counts);
  }
  return out;
}

/** Counters from an earlier page load plus this one's. */
export function addSignals(
  base: Record<string, InputSignalCounts>,
  local: Record<string, InputSignalCounts>
): Record<string, InputSignalCounts> {
  const out: Record<string, InputSignalCounts> = { ...base };
  for (const [q, counts] of Object.entries(local)) {
    const sum: InputSignalCounts = { ...out[q] };
    for (const k of COUNT_KEYS) {
      const v = (sum[k] ?? 0) + (counts[k] ?? 0);
      if (v > 0) sum[k] = v;
    }
    // The local log starts from the saved one, so it replaces it.
    if (counts.log) sum.log = counts.log;
    out[q] = sum;
  }
  return out;
}

export type InputFindingId =
  | 'jump-clicks'
  | 'line-clicks'
  | 'instant-keys'
  | 'even-typing'
  | 'fast-typing'
  | 'unkeyed-text'
  | 'pasted'
  | 'paste-attempts'
  | 'scripted'
  | 'even-answers'
  | 'no-revisions'
  | 'fast-answers'
  | 'side-panel'
  | 'extra-screen';

export interface InputFinding {
  id: InputFindingId;
  /** What was seen, with its numbers. */
  text: string;
  /** Ids of the questions it showed up on; empty when it spans the attempt. */
  questions: string[];
  /** What else could explain it. */
  otherCauses: string;
}

const JUMP_MIN = 3;
const JUMP_MIN_SHARE = 0.5;
const LINE_MIN = 3;
const INSTANT_MIN = 10;
const INSTANT_MIN_SHARE = 0.5;
const RHYTHM_MIN_GAPS = 30;
const EVEN_TYPING_CV = 0.2;
/** 40 ms a key is about 300 words a minute. */
const FAST_MEAN_GAP_MS = 40;
const UNKEYED_MIN = 20;
const ANSWER_MIN_GAPS = 5;
const EVEN_ANSWERS_CV = 0.15;

const NO_REVISION_MIN_CHARS = 200;
const READ_MIN_WORDS = 30;
/** 100 ms a word is 600 words a minute, twice a fast reader. */
const READ_MS_PER_WORD = 100;
const FAST_ANSWERS_MIN = 2;

/** What `fast-answers` needs: each question's length and which ones the student answered. */
export interface ReadingContext {
  words: Record<string, number>;
  answered: ReadonlySet<string>;
}

const countWords = (text: string): number =>
  text
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

/** Words a student has to read on each question: its text and its options. */
export const questionWordCounts = (
  questions: Pick<
    QuizQuestion,
    'id' | 'text' | 'correctAnswer' | 'incorrectAnswers'
  >[]
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const q of questions)
    out[q.id] = countWords(
      [q.text, q.correctAnswer, ...(q.incorrectAnswers ?? [])].join(' ')
    );
  return out;
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Flags for one attempt. An empty list means nothing stood out, not that the work is the student's own. */
export function describeInputSignals(
  perQuestion: Record<string, InputSignalCounts>,
  answers?: Pick<QuizResponseAnswer, 'answeredAt'>[],
  reading?: ReadingContext
): InputFinding[] {
  const total = emptyCounts();
  for (const c of Object.values(perQuestion))
    for (const k of COUNT_KEYS) total[k] += c[k] ?? 0;
  const where = (test: (c: InputSignalCounts) => boolean): string[] =>
    Object.entries(perQuestion)
      .filter(([q, c]) => q !== NO_QUESTION && test(c))
      .map(([q]) => q);

  const out: InputFinding[] = [];
  if (
    total.jumpClicks >= JUMP_MIN &&
    total.jumpClicks / total.clicks >= JUMP_MIN_SHARE
  ) {
    out.push({
      id: 'jump-clicks',
      text: `${total.jumpClicks} of ${plural(total.clicks, 'mouse click')} landed with no mouse movement leading to them.`,
      questions: where((c) => (c.jumpClicks ?? 0) > 0),
      otherCauses:
        'A touchscreen or remote-desktop tool that reports as a mouse.',
    });
  }
  if (total.lineClicks >= LINE_MIN) {
    out.push({
      id: 'line-clicks',
      text: `${plural(total.lineClicks, 'click')} followed a perfectly straight path at constant speed.`,
      questions: where((c) => (c.lineClicks ?? 0) > 0),
      otherCauses: 'Rare by hand; a hand speeds up and slows down.',
    });
  }
  if (
    total.instantKeys >= INSTANT_MIN &&
    total.instantKeys / total.keys >= INSTANT_MIN_SHARE
  ) {
    out.push({
      id: 'instant-keys',
      text: `${total.instantKeys.toLocaleString()} of ${plural(total.keys, 'key press', 'key presses')} were released in under ${INSTANT_KEY_MS} ms.`,
      questions: where((c) => (c.instantKeys ?? 0) > 0),
      otherCauses: 'An on-screen keyboard, a text expander or voice typing.',
    });
  }
  if (total.ikN >= RHYTHM_MIN_GAPS) {
    const mean = total.ikSum / total.ikN;
    if (mean < FAST_MEAN_GAP_MS) {
      out.push({
        id: 'fast-typing',
        text: `Typed ${plural(total.keys, 'character')} about ${Math.round(mean)} ms apart, faster than a person can type.`,
        questions: where((c) => (c.ikN ?? 0) > 0),
        otherCauses: 'A text expander or voice typing.',
      });
    } else if (cv(total.ikN, total.ikSum, total.ikSq) < EVEN_TYPING_CV) {
      out.push({
        id: 'even-typing',
        text: `Typed ${plural(total.keys, 'character')} at an almost perfectly even rhythm (about ${Math.round(mean)} ms apart).`,
        questions: where((c) => (c.ikN ?? 0) > 0),
        otherCauses: 'Rare by hand; typing rhythm varies letter to letter.',
      });
    }
  }
  if (total.unkeyedChars >= UNKEYED_MIN) {
    out.push({
      id: 'unkeyed-text',
      text: `${plural(total.unkeyedChars, 'character')} appeared in answer boxes with no key presses.`,
      questions: where((c) => (c.unkeyedChars ?? 0) > 0),
      otherCauses:
        'Voice typing, autocomplete, or a spelling or grammar extension.',
    });
  }
  if (total.pastedChars > 0) {
    out.push({
      id: 'pasted',
      text: `Pasted ${plural(total.pastedChars, 'character')} into answer boxes.`,
      questions: where((c) => (c.pastedChars ?? 0) > 0),
      otherCauses: 'Moving their own text between answers.',
    });
  } else if (total.pastes > 0) {
    out.push({
      id: 'paste-attempts',
      text: `Tried to paste ${plural(total.pastes, 'time')}.`,
      questions: where((c) => (c.pastes ?? 0) > 0),
      otherCauses: 'Habit; nothing was pasted.',
    });
  }
  if (total.scripted > 0) {
    out.push({
      id: 'scripted',
      text: `${plural(total.scripted, 'click or edit', 'clicks or edits')} came from a script in the browser, not a mouse or keyboard.`,
      questions: where((c) => (c.scripted ?? 0) > 0),
      otherCauses:
        'A browser extension such as a password manager, grammar checker or accessibility tool.',
    });
  }
  const unrevised = where(
    (c) =>
      (c.chars ?? 0) >= NO_REVISION_MIN_CHARS &&
      !c.dels &&
      !c.midInserts &&
      !c.pastedChars
  );
  if (unrevised.length > 0) {
    const chars = unrevised.reduce(
      (n, q) => n + (perQuestion[q].chars ?? 0),
      0
    );
    out.push({
      id: 'no-revisions',
      text: `Typed ${plural(chars, 'character')} without deleting or changing anything.`,
      questions: unrevised,
      otherCauses: 'Copying out an answer they drafted on paper first.',
    });
  }
  if (reading) {
    const fast = Object.entries(perQuestion)
      .filter(([q, c]) => {
        const words = reading.words[q] ?? 0;
        return (
          reading.answered.has(q) &&
          words >= READ_MIN_WORDS &&
          (c.ms ?? 0) > 0 &&
          (c.ms ?? 0) < words * READ_MS_PER_WORD
        );
      })
      .map(([q]) => q);
    if (fast.length >= FAST_ANSWERS_MIN) {
      out.push({
        id: 'fast-answers',
        text: `Answered ${plural(fast.length, 'question')} in less time than it takes to read them.`,
        questions: fast,
        otherCauses:
          'Guessing, or remembering the question from an earlier attempt.',
      });
    }
  }
  if (total.panelOpens > 0) {
    out.push({
      id: 'side-panel',
      text: `The page got narrower ${plural(total.panelOpens, 'time')} while the window stayed the same size, as when a browser side panel opens.`,
      questions: where((c) => (c.panelOpens ?? 0) > 0),
      otherCauses: 'A bookmarks or reading-list panel, or developer tools.',
    });
  }
  if (total.extraScreen > 0) {
    out.push({
      id: 'extra-screen',
      text: 'A second screen was connected.',
      questions: [],
      otherCauses: 'A desk monitor or a classroom projector.',
    });
  }

  const times = (answers ?? [])
    .map((a) => a.answeredAt)
    .filter((t) => Number.isFinite(t) && t > 0)
    .sort((a, b) => a - b);
  if (times.length > ANSWER_MIN_GAPS) {
    let sum = 0;
    let sq = 0;
    for (let i = 1; i < times.length; i += 1) {
      const gap = times[i] - times[i - 1];
      sum += gap;
      sq += gap * gap;
    }
    const n = times.length - 1;
    if (sum / n >= 1000 && cv(n, sum, sq) < EVEN_ANSWERS_CV) {
      out.push({
        id: 'even-answers',
        text: `${plural(times.length, 'answer')} arrived almost exactly ${Math.round(sum / n / 1000)} seconds apart.`,
        questions: [],
        otherCauses: 'Unlikely by hand unless the questions are very alike.',
      });
    }
  }
  return out;
}

/** " (Q2, Q5)" in the quiz's own numbering; ids it can't place are counted, never numbered. */
export const formatFindingQuestions = (
  ids: string[],
  order: readonly string[] | undefined
): string => {
  if (ids.length === 0) return '';
  const numbers = ids
    .map((id) => (order ? order.indexOf(id) + 1 : 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const others = ids.length - numbers.length;
  if (numbers.length === 0)
    return ` (on ${others} ${others === 1 ? 'question' : 'questions'})`;
  return ` (Q${numbers.join(', Q')}${others > 0 ? `, +${others} more` : ''})`;
};

export interface AttemptFindings {
  /** Completed attempts before this one; 0 is the first attempt. */
  attempt: number;
  findings: InputFinding[];
}

/** Every attempt that has something to show, latest first. `answers` belong to `currentAttempt`. */
export function inputFindingsByAttempt(
  signals: InputSignals | undefined,
  currentAttempt: number,
  answers?: Pick<QuizResponseAnswer, 'answeredAt'>[],
  reading?: ReadingContext
): AttemptFindings[] {
  const attempts = new Set<number>([currentAttempt]);
  if (isRecord(signals)) {
    for (const key of Object.keys(signals))
      if (/^\d{1,3}$/.test(key)) attempts.add(Number(key));
  }
  return [...attempts]
    .sort((a, b) => b - a)
    .map((attempt) => ({
      attempt,
      findings: describeInputSignals(
        readAttemptSignals(signals, attempt),
        attempt === currentAttempt ? answers : undefined,
        attempt === currentAttempt ? reading : undefined
      ),
    }))
    .filter((a) => a.findings.length > 0);
}

export interface WrittenAnswerLog {
  /** Completed attempts before this one; 0 is the first attempt. */
  attempt: number;
  questionId: string;
  log: string;
}

/** Every written answer with an edit log, latest attempt first. */
export function writingLogs(
  signals: InputSignals | undefined
): WrittenAnswerLog[] {
  if (!isRecord(signals)) return [];
  const out: WrittenAnswerLog[] = [];
  for (const key of Object.keys(signals)) {
    if (!/^\d{1,3}$/.test(key)) continue;
    for (const [questionId, c] of Object.entries(
      readAttemptSignals(signals, key)
    ))
      if (c.log) out.push({ attempt: Number(key), questionId, log: c.log });
  }
  return out.sort((a, b) => b.attempt - a.attempt);
}

/** Log characters already saved on a response outside one attempt. */
export function otherLogChars(signals: unknown, attempt: number): number {
  if (!isRecord(signals)) return 0;
  let n = 0;
  for (const [key, perQuestion] of Object.entries(signals)) {
    if (key === String(attempt) || !isRecord(perQuestion)) continue;
    for (const c of Object.values(perQuestion))
      if (isRecord(c) && typeof c.log === 'string') n += c.log.length;
  }
  return n;
}
