/** RTF pictures (docs/plans/shipped/QUIZ_EXAMVIEW_IMPORT.md E11). */
import { describe, it, expect, vi } from 'vitest';
import { parseRtfDocument } from '@/utils/quizDocumentImport/rtfReader';
import {
  dibToBmp,
  emfBitmap,
  wmfBitmap,
} from '@/utils/quizDocumentImport/rtfPictures';
import { readQuizDocument } from '@/utils/quizDocumentImport';

const HEADER = '{\\rtf1\\ansi\\deff0';

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** A 2×1 24-bit DIB: a 40-byte header and one padded row. */
function dib(): Uint8Array {
  const out = new Uint8Array(40 + 8);
  const v = new DataView(out.buffer);
  v.setUint32(0, 40, true);
  v.setInt32(4, 2, true);
  v.setInt32(8, 1, true);
  v.setUint16(12, 1, true);
  v.setUint16(14, 24, true);
  out.set([0, 0, 255, 0, 255, 0], 40);
  return out;
}

/** An ExamView-style metafile: header, a few state records, one META_STRETCHDIB, EOF. */
function wmf(records: 'bitmap' | 'vector' = 'bitmap'): Uint8Array {
  const parts: number[] = [];
  const word = (n: number) => parts.push(n & 0xff, (n >> 8) & 0xff);
  const dword = (n: number) => {
    word(n & 0xffff);
    word(n >>> 16);
  };
  const record = (fn: number, body: number[]) => {
    dword(3 + body.length / 2);
    word(fn);
    parts.push(...body);
  };
  // 18-byte header: type, header words, version, size, objects, max record, params.
  word(1);
  word(9);
  word(0x300);
  dword(0);
  word(0);
  dword(0);
  word(0);
  record(0x0103, [8, 0]);
  record(0x020b, [0, 0, 0, 0]);
  if (records === 'bitmap') {
    record(0x0f43, [...new Array<number>(22).fill(0), ...dib()]);
  } else {
    // META_POLYLINE: a drawing, not a bitmap.
    record(0x0325, [2, 0, 0, 0, 0, 0, 5, 0, 5, 0]);
  }
  record(0, []);
  return Uint8Array.from(parts);
}

describe('metafile unwrapping', () => {
  it('finds the one bitmap inside an ExamView metafile', () => {
    expect(Array.from(wmfBitmap(wmf()) ?? [])).toEqual(Array.from(dib()));
  });

  it('refuses a metafile that draws vectors', () => {
    expect(wmfBitmap(wmf('vector'))).toBeNull();
  });

  it('returns null for truncated data instead of throwing', () => {
    const placeable = new Uint8Array(20);
    new DataView(placeable.buffer).setUint32(0, 0x9ac6cdd7, true);
    expect(wmfBitmap(placeable)).toBeNull();
    const short = new Uint8Array(14);
    new DataView(short.buffer).setUint32(0, 14, true);
    expect(dibToBmp(short)).toBeNull();
  });

  it('puts a BMP file header with the pixel offset in front of a DIB', () => {
    const bmp = dibToBmp(dib()) ?? new Uint8Array(14);
    const v = new DataView(bmp.buffer);
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
    expect(v.getUint32(2, true)).toBe(14 + 48);
    expect(v.getUint32(10, true)).toBe(14 + 40);
  });

  it('reads an enhanced metafile whose only drawing is a stretched bitmap', () => {
    const bits = dib();
    const bmi = bits.subarray(0, 40);
    const pixels = bits.subarray(40);
    const record = new Uint8Array(80 + bmi.length + pixels.length);
    const v = new DataView(record.buffer);
    v.setUint32(0, 81, true);
    v.setUint32(4, record.length, true);
    v.setUint32(48, 80, true);
    v.setUint32(52, bmi.length, true);
    v.setUint32(56, 80 + bmi.length, true);
    v.setUint32(60, pixels.length, true);
    record.set(bmi, 80);
    record.set(pixels, 80 + bmi.length);
    const header = new Uint8Array(8);
    new DataView(header.buffer).setUint32(0, 1, true);
    new DataView(header.buffer).setUint32(4, 8, true);
    const emf = new Uint8Array([...header, ...record]);
    expect(Array.from(emfBitmap(emf) ?? [])).toEqual(Array.from(bits));
  });
});

describe('parseRtfDocument pictures', () => {
  it('anchors a picture to its paragraph and keeps the text around it', () => {
    const { lines, pictures } = parseRtfDocument(
      `${HEADER}\\pard 1. Look at the graph.{\\dn0 {\\pict\\wmetafile8\\picw0\\pich0\n${hex(wmf())}\n}}\\par}`
    );
    expect(pictures).toHaveLength(1);
    expect(pictures[0].kind).toBe('wmf');
    expect(Array.from(pictures[0].bytes)).toEqual(Array.from(wmf()));
    expect(lines[0].text.trim()).toBe('1. Look at the graph.');
    expect(lines[0].imageIds).toEqual([pictures[0].id]);
  });

  it('keeps a picture that sits in a paragraph of its own', () => {
    const { lines } = parseRtfDocument(
      `${HEADER}\\pard 1. Stem\\par\\pard {\\pict\\pngblip 89504e47}\\par}`
    );
    expect(lines[1]).toMatchObject({ imageIds: ['rtf-img-1'] });
  });

  it('gets a \\bin picture’s bytes back from the Windows-1252 decode', () => {
    // WHATWG maps 0x81, 0x8D, 0x8F, 0x90 and 0x9D to U+0081 etc., never U+FFFD.
    const bytes = Uint8Array.from([
      0x80, 0x81, 0x8d, 0x8f, 0x90, 0x92, 0x9d, 0x9f, 0xff, 0x00,
    ]);
    const decoded = new TextDecoder('windows-1252').decode(bytes);
    expect(decoded).not.toContain('�');
    const rtf =
      `${HEADER}\\pard x{\\pict\\pngblip\\bin${bytes.length} ` +
      decoded +
      `}\\par}`;
    const { pictures } = parseRtfDocument(rtf);
    expect(Array.from(pictures[0].bytes)).toEqual(Array.from(bytes));
  });

  it('reads Word’s shppict picture and skips its nonshppict fallback', () => {
    const { pictures } = parseRtfDocument(
      `${HEADER}\\pard x{\\*\\shppict{\\pict{\\*\\picprop}\\pngblip 89504e47}}{\\nonshppict{\\pict\\wmetafile8 0100}}\\par}`
    );
    expect(pictures.map((p) => [p.kind, hex(p.bytes)])).toEqual([
      ['png', '89504e47'],
    ]);
  });
});

describe('readQuizDocument — RTF pictures', () => {
  const file = (pict: string) =>
    new File(
      [
        `${HEADER}\\pard 1. Which graph is shown?\\par\\pard {\\pict\\wmetafile8 ${pict}}\\par\\pard A. Line\\par\\pard B. {\\b Bar}\\par\\pard 2. Next?\\par\\pard A. Yes\\par\\pard B. {\\b No}\\par}`,
      ],
      'Test.rtf',
      { type: 'application/rtf' }
    );

  it('attaches a metafile’s bitmap to its question as a PNG', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    const bmpToPng = vi.fn(() => Promise.resolve(png));
    const quiz = await readQuizDocument(file(hex(wmf())), { bmpToPng });
    expect(bmpToPng).toHaveBeenCalledTimes(1);
    expect(quiz.images).toHaveLength(1);
    expect(quiz.images[0]).toMatchObject({ contentType: 'image/png' });
    expect(quiz.questions[0].imageIds).toEqual([quiz.images[0].id]);
    expect(quiz.questions[1].imageIds).toEqual([]);
    expect(quiz.warnings.join(' ')).not.toMatch(/picture/i);
  });

  it('keeps reading when a picture’s data is damaged', async () => {
    const placeable = new Uint8Array(20);
    new DataView(placeable.buffer).setUint32(0, 0x9ac6cdd7, true);
    const quiz = await readQuizDocument(file(hex(placeable)), {
      bmpToPng: () => Promise.reject(new Error('unused')),
    });
    expect(quiz.questions).toHaveLength(2);
    expect(quiz.warnings).toContain(
      'Question 1’s picture couldn’t be read — add it in the editor.'
    );
  });

  it('names the question whose picture is a vector drawing', async () => {
    const quiz = await readQuizDocument(file(hex(wmf('vector'))), {
      bmpToPng: () => Promise.reject(new Error('unused')),
    });
    expect(quiz.images).toEqual([]);
    expect(quiz.questions[0].imageIds).toEqual([]);
    expect(quiz.warnings).toContain(
      'Question 1’s picture couldn’t be read — add it in the editor.'
    );
  });
});
