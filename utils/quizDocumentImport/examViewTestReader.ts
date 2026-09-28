/**
 * Reads ExamView's own test file (.tst) into the lines ExamView would print,
 * plus the answer key the file stores, so it takes the same parse as a
 * printed ExamView test (docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md).
 *
 * The format is undocumented. What this relies on, from real files:
 *   - A 16-byte `\x1aFSCTST#…#` header, then one zlib stream.
 *   - Each question is a record opened by `FFFFFFFF 01 00 <n>`, an n-byte
 *     reference tag, the record length, 15 more ints and then the question
 *     text as UTF-16 ending at a 0 character.
 *   - 508 bytes before that header: `FFFFFFFF`, with the question type 4
 *     bytes before it and the multiple-choice answer (0 = a) 16 bytes after.
 *   - In the text, 0x0D ends a paragraph, 0x0F marks a picture and 0x10
 *     opens the choice table, whose cells 0x11 separates.
 *   - A picture is `<size> 1 <w> <h>` followed by a packed Windows bitmap.
 */

import type { DocLine, KeyItem } from './types';
import type { RtfPicture } from './rtfPictures';

const MAGIC = '\x1aFSCTST';
/** Past this the file is not a test anyone typed; stop before memory runs out. */
const MAX_INFLATED_BYTES = 256 * 1024 * 1024;

/** ExamView's question types, by the code the file stores. */
const TYPE_NAMES = [
  'True/False',
  'Modified True/False',
  'Multiple Choice',
  'Multiple Response',
  'Bimodal',
  'Yes/No',
  'Numeric Response',
  'Completion',
  'Matching',
  'Short Answer',
  'Problem',
  'Essay',
  'Case',
  'Other',
] as const;

const MULTIPLE_CHOICE = 2;
/** Short Answer, Problem, Essay, Case and Other: answered in writing. */
const WRITTEN_TYPES = new Set([9, 10, 11, 12, 13]);
/** Types ExamView prints with a `____` answer blank before the number. */
const BLANK_TYPES = new Set([0, 1, 2, 3, 4, 5]);

const PREFIX_BACK = 508;
const TEXT_AFTER_TAG = 60;

const PARAGRAPH = 0x0d;
const PICTURE = 0x0f;
const CHOICES = 0x10;
const CELL = 0x11;

export const NOT_AN_EXAMVIEW_TEST =
  'This doesn’t look like an ExamView test. In ExamView, choose File > Export > Rich Text Format and import that file instead.';

export interface ExamViewTestContent {
  lines: DocLine[];
  /** Packed bitmaps, for `rtfPictureImages`. */
  pictures: RtfPicture[];
  /** The answers the file stores, for `mergeAnswerKey`. */
  keyItems: KeyItem[];
  /** A written item's prompt with its paragraphs, by question number. */
  writtenTexts: Map<number, string>;
  warnings: string[];
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(bytes as BlobPart).body;
  if (!body) throw new Error(NOT_AN_EXAMVIEW_TEST);
  const reader = body
    .pipeThrough(new DecompressionStream('deflate'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_INFLATED_BYTES) {
      await reader.cancel();
      throw new Error(NOT_AN_EXAMVIEW_TEST);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** The zlib stream inside a .tst file, or null when the header is not ExamView's. */
export function examViewPayload(bytes: Uint8Array): Uint8Array | null {
  const head = String.fromCharCode(...bytes.subarray(0, MAGIC.length));
  if (head !== MAGIC) return null;
  // The stream starts after a `#` with a valid zlib header (CMF 0x78, checksum % 31).
  for (let i = MAGIC.length + 1; i < Math.min(bytes.length - 1, 64); i++) {
    if (
      bytes[i - 1] === 0x23 &&
      bytes[i] === 0x78 &&
      (bytes[i] * 256 + bytes[i + 1]) % 31 === 0
    ) {
      return bytes.subarray(i);
    }
  }
  return null;
}

class Reader {
  private readonly view: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.length;
  }

  u16(at: number): number {
    return at >= 0 && at + 2 <= this.length
      ? this.view.getUint16(at, true)
      : -1;
  }

  u32(at: number): number {
    return at >= 0 && at + 4 <= this.length
      ? this.view.getUint32(at, true)
      : -1;
  }

  i32(at: number): number {
    return at >= 0 && at + 4 <= this.length ? this.view.getInt32(at, true) : 0;
  }

  /** UTF-16 code units from `at` up to a 0 or `end`. */
  units(at: number, end: number): { codes: number[]; end: number } {
    const codes: number[] = [];
    let i = at;
    while (i + 2 <= Math.min(end, this.length)) {
      const c = this.u16(i);
      i += 2;
      if (c === 0) break;
      codes.push(c);
    }
    return { codes, end: i };
  }
}

/** A question header with its type block where it should be. */
function isHeader(r: Reader, at: number): boolean {
  if (r.u32(at) !== 0xffffffff || r.u32(at + 4) !== 1 || r.u32(at + 8) !== 0)
    return false;
  const tagBytes = r.u32(at + 12);
  if (tagBytes < 4 || tagBytes > 1024) return false;
  const prefix = at - PREFIX_BACK;
  if (r.u32(prefix) !== 0xffffffff) return false;
  const type = r.u32(prefix - 4);
  return type >= 0 && type < TYPE_NAMES.length;
}

function findHeader(r: Reader, from: number, to: number): number {
  const end = Math.min(to, r.length - 16);
  for (let i = Math.max(from, PREFIX_BACK + 4); i < end; i++) {
    if (r.bytes[i] === 0xff && isHeader(r, i)) return i;
  }
  return -1;
}

interface Record {
  type: number;
  answer: number;
  text: number[];
  /** Where the question's own bytes end, pictures included. */
  end: number;
  textEnd: number;
}

function readRecords(r: Reader): Record[] {
  const headers: number[] = [];
  let at = findHeader(r, 0, 1024 * 1024);
  while (at >= 0) {
    headers.push(at);
    const tagBytes = r.u32(at + 12);
    const length = r.u32(at + 16 + tagBytes);
    const textEnd = r.units(at + 16 + tagBytes + TEXT_AFTER_TAG, r.length).end;
    // The stored length skips a record's pictures; a bad one falls back to a full scan.
    const guess = length > 0 && at + length < r.length ? at + length : textEnd;
    at = findHeader(r, Math.max(guess, textEnd), guess + 64 * 1024);
    if (at < 0) at = findHeader(r, textEnd, r.length);
  }
  return headers.map((h, i) => {
    const start = h + 16 + r.u32(h + 12) + TEXT_AFTER_TAG;
    const { codes, end: textEnd } = r.units(start, r.length);
    const next = headers[i + 1];
    return {
      type: r.u32(h - PREFIX_BACK - 4),
      answer: r.i32(h - PREFIX_BACK + 16),
      text: codes,
      end: next === undefined ? r.length : next - PREFIX_BACK - 12,
      textEnd,
    };
  });
}

const BITS_PER_PIXEL = new Set([1, 4, 8, 16, 24, 32]);

/** The packed bitmaps stored between a question's text and its end, in order. */
function picturesIn(r: Reader, from: number, to: number): Uint8Array[] {
  const found: Uint8Array[] = [];
  let i = from;
  while (i + 48 <= to) {
    const size = r.u32(i);
    if (
      r.u32(i + 16) === 40 &&
      r.u32(i + 4) === 1 &&
      size > 52 &&
      i + 4 + size <= to
    ) {
      const width = r.i32(i + 20);
      const height = Math.abs(r.i32(i + 24));
      const bpp = r.u16(i + 30);
      const stride = Math.floor((width * bpp + 31) / 32) * 4;
      if (
        width > 0 &&
        height > 0 &&
        r.u16(i + 28) === 1 &&
        BITS_PER_PIXEL.has(bpp) &&
        size >= 12 + 40 + stride * height
      ) {
        found.push(r.bytes.subarray(i + 16, i + 4 + size));
        i += 4 + size;
        continue;
      }
    }
    i += 1;
  }
  return found;
}

/** Printable UTF-16 runs of 2+ characters, for the type headings table. */
function stringsIn(r: Reader, from: number, to: number): string[] {
  const out: string[] = [];
  let i = from;
  while (i + 2 <= to) {
    let s = '';
    let j = i;
    for (;;) {
      const c = r.u16(j);
      if (c < 0x20 || c >= 0xfffe || j + 2 > to) break;
      s += String.fromCharCode(c);
      j += 2;
    }
    if (s.trim().length >= 2 && /[A-Za-z]/.test(s)) {
      out.push(s.trim());
      i = j;
    } else {
      i += 1;
    }
  }
  return out;
}

/** Each type's heading and directions as the test prints them. */
function typeHeadings(
  r: Reader,
  from: number
): Map<number, { name: string; directions?: string }> {
  const headings = new Map<number, { name: string; directions?: string }>();
  const strings = stringsIn(r, from, r.length);
  const known = new Set<string>(TYPE_NAMES);
  strings.forEach((s, i) => {
    const code = TYPE_NAMES.indexOf(s as (typeof TYPE_NAMES)[number]);
    if (code < 0 || headings.has(code)) return;
    const next = strings[i + 1];
    headings.set(code, {
      name: s,
      ...(next && !known.has(next) ? { directions: next } : {}),
    });
  });
  return headings;
}

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface ParsedText {
  /** Paragraphs, with a picture's place as `null`. */
  paragraphs: Array<string | null>;
  options: Array<{ letter: string; text: string }>;
}

function parseText(codes: readonly number[]): ParsedText {
  const paragraphs: Array<string | null> = [];
  let current = '';
  let i = 0;
  const flush = (): void => {
    if (tidy(current)) paragraphs.push(tidy(current));
    current = '';
  };
  for (; i < codes.length && codes[i] !== CHOICES; i++) {
    const c = codes[i];
    if (c === PARAGRAPH) flush();
    else if (c === PICTURE) {
      flush();
      paragraphs.push(null);
    } else if (c === 0x09 || c === 0x0b) current += ' ';
    else if (c >= 0x20) current += String.fromCharCode(c);
  }
  flush();

  const cells: string[] = [];
  let cell = '';
  for (i += 1; i < codes.length; i++) {
    const c = codes[i];
    if (c === CELL) {
      cells.push(tidy(cell));
      cell = '';
    } else if (c >= 0x20) cell += String.fromCharCode(c);
    else if (c === PARAGRAPH || c === 0x09 || c === 0x0b) cell += ' ';
  }
  if (tidy(cell)) cells.push(tidy(cell));

  const options: ParsedText['options'] = [];
  for (let k = 0; k < cells.length; k++) {
    const label = /^([a-z])[.)]$/i.exec(cells[k]);
    if (!label) continue;
    options.push({ letter: label[1].toLowerCase(), text: cells[k + 1] ?? '' });
    k += 1;
  }
  options.sort((a, b) => a.letter.localeCompare(b.letter));
  return { paragraphs, options };
}

/** The test as the lines ExamView prints, with its stored key and pictures. */
export function parseExamViewTest(bytes: Uint8Array): ExamViewTestContent {
  const r = new Reader(bytes);
  const records = readRecords(r);
  if (records.length === 0) throw new Error(NOT_AN_EXAMVIEW_TEST);
  const headings = typeHeadings(r, records[records.length - 1].textEnd);

  const lines: DocLine[] = [];
  const pictures: RtfPicture[] = [];
  const keyItems: KeyItem[] = [];
  const writtenTexts = new Map<number, string>();
  const warnings: string[] = [];
  let lastType = -1;
  let missingPictures = 0;

  records.forEach((record, index) => {
    const number = index + 1;
    if (record.type !== lastType) {
      const heading = headings.get(record.type);
      lines.push({ text: heading?.name ?? TYPE_NAMES[record.type] });
      if (heading?.directions) lines.push({ text: heading.directions });
      lastType = record.type;
    }

    const { paragraphs, options } = parseText(record.text);
    const bitmaps = picturesIn(r, record.textEnd, record.end);
    const ids = bitmaps.map((bytes) => {
      const id = `pict-${pictures.length + 1}`;
      pictures.push({ id, kind: 'dib', bytes });
      return id;
    });
    const blank = BLANK_TYPES.has(record.type) ? '____ ' : '';
    // One line, so a part label like "20 A" can't read as a key entry.
    if (WRITTEN_TYPES.has(record.type)) {
      const prompt = paragraphs.filter((p): p is string => p !== null);
      writtenTexts.set(number, prompt.join('\n'));
      lines.push({
        text: `${number}. ${prompt.join(' ')}`,
        ...(ids.length > 0 ? { imageIds: ids } : {}),
      });
      return;
    }
    let opened = false;
    let placed = 0;
    for (const paragraph of paragraphs) {
      if (paragraph === null) {
        const id = ids[placed];
        placed += 1;
        if (!id) {
          missingPictures += 1;
          continue;
        }
        if (!opened) {
          lines.push({ text: `${blank}${number}.`, imageIds: [id] });
          opened = true;
        } else {
          lines.push({ text: '', imageIds: [id] });
        }
        continue;
      }
      lines.push({
        text: opened ? paragraph : `${blank}${number}. ${paragraph}`,
      });
      opened = true;
    }
    if (!opened) lines.push({ text: `${blank}${number}.` });
    // A picture the text never marked still belongs to this question.
    const unplaced = ids.slice(placed);
    if (unplaced.length > 0) lines.push({ text: '', imageIds: unplaced });
    for (const option of options) {
      lines.push({ text: `${option.letter}. ${option.text}` });
    }

    const keyed =
      record.type === MULTIPLE_CHOICE &&
      record.answer >= 0 &&
      record.answer < options.length;
    if (keyed) {
      keyItems.push({
        item: number,
        answer: options[record.answer].letter.toUpperCase(),
      });
    }
  });

  if (missingPictures > 0) {
    warnings.push(
      missingPictures === 1
        ? 'One picture in the test couldn’t be read. Add it in the editor.'
        : `${missingPictures} pictures in the test couldn’t be read. Add them in the editor.`
    );
  }
  return { lines, pictures, keyItems, writtenTexts, warnings };
}

export async function readExamViewTest(
  file: Blob
): Promise<ExamViewTestContent> {
  // `FileReader` rather than `Blob.arrayBuffer`, which older Safari does not have.
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Read failed.'));
    reader.readAsArrayBuffer(file);
  });
  const payload = examViewPayload(new Uint8Array(buffer));
  if (!payload) throw new Error(NOT_AN_EXAMVIEW_TEST);
  let inflated: Uint8Array;
  try {
    inflated = await inflate(payload);
  } catch {
    throw new Error(NOT_AN_EXAMVIEW_TEST);
  }
  return parseExamViewTest(inflated);
}
