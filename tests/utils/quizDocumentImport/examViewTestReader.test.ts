/** ExamView's own .tst file, built byte for byte in the layout real files use. */
import { describe, it, expect } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  NOT_AN_EXAMVIEW_TEST,
  documentKind,
  readQuizDocument,
} from '@/utils/quizDocumentImport';
import {
  examViewPayload,
  parseExamViewTest,
} from '@/utils/quizDocumentImport/examViewTestReader';
import {
  MAX_DOCUMENT_BYTES,
  MAX_EXAMVIEW_TEST_BYTES,
  byteLimitFor,
} from '@/utils/quizDocumentImport/limits';

const MC = 2;
const SHORT_ANSWER = 9;
const P = '\r';
const PICTURE = '\x0f';
const CHOICES = '\x10';
const CELL = '\x11';

class Bytes {
  parts: number[] = [];
  get length(): number {
    return this.parts.length;
  }
  u16(n: number): this {
    this.parts.push(n & 0xff, (n >> 8) & 0xff);
    return this;
  }
  u32(n: number): this {
    return this.u16(n & 0xffff).u16((n >>> 16) & 0xffff);
  }
  utf16(s: string, terminate = true): this {
    for (const ch of s) this.u16(ch.charCodeAt(0));
    if (terminate) this.u16(0);
    return this;
  }
  zeros(n: number): this {
    for (let i = 0; i < n; i++) this.parts.push(0);
    return this;
  }
  bytes(b: Uint8Array): this {
    this.parts.push(...b);
    return this;
  }
}

/** A 2×1 24-bit bitmap in ExamView's wrapper: size, 1, himetric width and height. */
function picture(): Uint8Array {
  const dib = new Bytes()
    .u32(40)
    .u32(2)
    .u32(1)
    .u16(1)
    .u16(24)
    .u32(0)
    .u32(8)
    .zeros(16)
    .bytes(new Uint8Array([0, 0, 255, 0, 255, 0, 0, 0]));
  const out = new Bytes()
    .u32(12 + dib.length)
    .u32(1)
    .u32(50)
    .u32(25);
  out.parts.push(...dib.parts);
  return new Uint8Array(out.parts);
}

interface Question {
  type: number;
  answer?: number;
  text: string;
  pictures?: number;
}

/** Choice cells in ExamView's two-column order: a, c, (row end), b, d. */
const choices = (a: string, b: string, c: string, d: string): string =>
  `${CHOICES}a.${CELL}${a}${CELL}c.${CELL}${c}${CELL}${CELL}b.${CELL}${b}${CELL}d.${CELL}${d}${CELL}${CELL}`;

function tstFile(questions: Question[]): Uint8Array {
  const out = new Bytes().utf16('Unit 1 Test');
  out.zeros(2048 - out.length);
  questions.forEach((q, i) => {
    // The type block sits 508 bytes before the header; its FFFFFFFF is at -508.
    out
      .u32(100 + i)
      .u32(0)
      .u32(q.type)
      .u32(0xffffffff);
    out
      .u32(0)
      .u32(1)
      .u32(0)
      .u32(q.answer ?? 0);
    out.zeros(488);
    const header = out.length;
    out.u32(0xffffffff).u32(1).u32(0).u32(12).utf16('1.4').u32(4);
    const lengthAt = out.length;
    out.u32(0).zeros(56);
    out.utf16(q.text);
    for (let k = 0; k < (q.pictures ?? 0); k++) out.bytes(picture());
    const length = out.length - header;
    out.parts.splice(
      lengthAt,
      4,
      length & 0xff,
      (length >> 8) & 0xff,
      (length >> 16) & 0xff,
      (length >>> 24) & 0xff
    );
    out.zeros(40);
  });
  out.zeros(64);
  out
    .utf16('True/False')
    .utf16('Indicate whether the statement is true or false.')
    .utf16('Multiple Choice')
    .utf16('Identify the choice that best completes the statement.')
    .utf16('Short Answer')
    .utf16('Answer in complete sentences.');
  const payload = deflateSync(Buffer.from(out.parts));
  const head = new TextEncoder().encode('\x1aFSCTST#W#06#00#');
  const file = new Uint8Array(head.length + payload.length);
  file.set(head);
  file.set(payload, head.length);
  return file;
}

const TEST: Question[] = [
  {
    type: MC,
    answer: 3,
    text: `Questions 1-2 use the map below.${P}${PICTURE}${P}Tenochtitlan grew mainly because of${choices('sanitation', 'free labor', 'ocean trade', 'farming and tribute')}`,
    pictures: 1,
  },
  {
    type: MC,
    answer: 2,
    text: `Inca and Aztec societies both${choices('came from the Maya', 'used iron', 'conquered neighbors', 'kept no records')}`,
  },
  {
    type: SHORT_ANSWER,
    text: `Answer EITHER question.${P}${P}20 A${P}A. Identify one similarity.${P}B. Identify one difference.`,
  },
];

const tstBlob = (bytes: Uint8Array, name = 'Unit 1.tst'): File =>
  new File([bytes as BlobPart], name);

const passBmp = (bmp: Blob): Promise<Blob> =>
  Promise.resolve(new Blob([bmp], { type: 'image/png' }));

describe('ExamView .tst reader', () => {
  it('is recognised by its extension and given a larger byte budget', () => {
    expect(documentKind(new Blob([]), 'Unit 1.TST')).toBe('examview');
    expect(byteLimitFor('examview')).toBe(MAX_EXAMVIEW_TEST_BYTES);
    expect(byteLimitFor('docx')).toBe(MAX_DOCUMENT_BYTES);
  });

  it('finds the zlib stream after the header', () => {
    const file = tstFile(TEST);
    expect(examViewPayload(file)?.[0]).toBe(0x78);
    expect(examViewPayload(new TextEncoder().encode('PK\x03\x04'))).toBeNull();
  });

  it('prints each question with its choices in letter order and keys it', () => {
    const payload = examViewPayload(tstFile(TEST));
    if (!payload) throw new Error('no payload');
    const inflated = new Uint8Array(inflateSync(payload));
    const read = parseExamViewTest(inflated);
    expect(read.lines.map((l) => l.text)).toEqual([
      'Multiple Choice',
      'Identify the choice that best completes the statement.',
      '____ 1. Questions 1-2 use the map below.',
      '',
      'Tenochtitlan grew mainly because of',
      'a. sanitation',
      'b. free labor',
      'c. ocean trade',
      'd. farming and tribute',
      '____ 2. Inca and Aztec societies both',
      'a. came from the Maya',
      'b. used iron',
      'c. conquered neighbors',
      'd. kept no records',
      'Short Answer',
      'Answer in complete sentences.',
      '3. Answer EITHER question. 20 A A. Identify one similarity. B. Identify one difference.',
    ]);
    expect(read.lines[3].imageIds).toEqual(['pict-1']);
    expect(read.pictures).toHaveLength(1);
    expect(read.keyItems).toEqual([
      { item: 1, answer: 'D' },
      { item: 2, answer: 'C' },
    ]);
  });

  it('imports keyed questions, pictures and written prompts intact', async () => {
    const quiz = await readQuizDocument(tstBlob(tstFile(TEST)), {
      bmpToPng: passBmp,
    });
    expect(quiz.title).toBe('Unit 1');
    expect(quiz.questions).toHaveLength(3);
    const [first, second, written] = quiz.questions;
    expect(first.type).toBe('MC');
    expect(first.correctAnswer).toBe('farming and tribute');
    expect(first.imageIds).toEqual(['pict-1']);
    expect(second.correctAnswer).toBe('conquered neighbors');
    expect(written.type).toBe('free-response');
    expect(written.text).toBe(
      'Answer EITHER question.\n20 A\nA. Identify one similarity.\nB. Identify one difference.'
    );
    expect(quiz.images).toHaveLength(1);
    expect(quiz.images[0].contentType).toBe('image/png');
    expect(quiz.keySummary).toMatchObject({ entries: 2, matched: 2 });
  });

  it('refuses a file that is not an ExamView test', async () => {
    await expect(
      readQuizDocument(tstBlob(new TextEncoder().encode('not a test')))
    ).rejects.toThrow(NOT_AN_EXAMVIEW_TEST);
  });
});
