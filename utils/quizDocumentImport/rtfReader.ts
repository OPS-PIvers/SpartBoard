/**
 * Reads an .rtf into lines, per docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D2.
 *
 * RTF is plain text with the formatting written inline, so unlike a PDF there
 * is nothing to guess about where a paragraph ends — and unlike a Word file
 * there is no zip to open. What matters is keeping bold, underline and
 * highlight, because that is how a teacher marks the right answer, and
 * throwing away the groups that hold fonts, colours and pictures rather than
 * letting their contents fall into the text.
 */

import type { DocLine, DocSegment } from './types';
import type { RtfPicture, RtfPictureKind } from './rtfPictures';

/** Groups whose contents are never document text. */
const IGNORED_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'listtable',
  'listoverridetable',
  'rsidtbl',
  'generator',
  'info',
  'object',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'xmlnstbl',
  'header',
  'headerl',
  'headerr',
  'headerf',
  'footer',
  'footerl',
  'footerr',
  'footerf',
  'footnote',
  'comment',
  'atrfstart',
  'atrfend',
  'annotation',
  'field',
  'nonshppict',
  'upr',
]);

/** Windows-1252's own slots; `\'92` is a curly apostrophe, not U+0092. */
const CP1252_HIGH: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

/** The byte each Windows-1252 character came from, to undo the decode for `in` data. */
const CP1252_BYTE = new Map(
  Object.entries(CP1252_HIGH).map(([byte, char]) => [
    char.charCodeAt(0),
    Number(byte),
  ])
);
const rawByte = (code: number): number =>
  code < 0x100 ? code : (CP1252_BYTE.get(code) ?? 0x3f);

/** WHATWG labels for the double-byte codepages `\ansicpg` can name. */
const DBCS_LABELS: Record<number, string> = {
  932: 'shift_jis',
  936: 'gbk',
  949: 'euc-kr',
  950: 'big5',
};

/** A decoder for `\ansicpg`, or null to keep the built-in Windows-1252 table. */
function codepageDecoder(codepage: number): TextDecoder | null {
  if (codepage === 1252) return null;
  try {
    return new TextDecoder(DBCS_LABELS[codepage] ?? `windows-${codepage}`);
  } catch {
    return null;
  }
}

/** Control words that stand in for a character. */
const LITERALS: Record<string, string> = {
  emdash: '—',
  endash: '–',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  bullet: '•',
};

/** Control words that end a paragraph; inside a table cell they only add a space. */
const PARAGRAPH_BREAKS = new Set(['par', 'line', 'sect', 'page']);

/** Column gaps: a new segment on the same line (R2). */
const SEGMENT_BREAKS = new Set(['tab', 'cell', 'nestcell']);

interface State {
  bold: boolean;
  underline: boolean;
  highlighted: boolean;
  /** Characters to skip after a `\uN`, set by `\ucN`. */
  uc: number;
  ignore: boolean;
}

const isAlpha = (c: string): boolean =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isOff = (param: number | null): boolean => param === 0;

/** The `\pict` control word naming the picture's format. */
const PICTURE_KINDS: Record<string, RtfPictureKind> = {
  pngblip: 'png',
  jpegblip: 'jpeg',
  wmetafile: 'wmf',
  emfblip: 'emf',
  macpict: 'other',
  pmmetafile: 'other',
  dibitmap: 'other',
  wbitmap: 'other',
};

const HEX_VALUE = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let d = 0; d < 10; d += 1) table[48 + d] = d;
  for (let d = 0; d < 6; d += 1) {
    table[65 + d] = 10 + d;
    table[97 + d] = 10 + d;
  }
  return table;
})();

/** A picture's hex text as bytes, skipping the line breaks RTF wraps it with. */
function hexBytes(chunks: readonly string[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(Math.ceil(total / 2));
  let length = 0;
  let high = -1;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const code = chunk.charCodeAt(i);
      const value = code < 128 ? HEX_VALUE[code] : -1;
      if (value < 0) continue;
      if (high < 0) high = value;
      else {
        out[length] = (high << 4) | value;
        length += 1;
        high = -1;
      }
    }
  }
  return out.subarray(0, length);
}

/** The text of an RTF file, one `DocLine` per paragraph or table row. */
export function parseRtf(rtf: string): DocLine[] {
  return parseRtfDocument(rtf).lines;
}

/** The lines of an RTF file and the pictures anchored to them (E11). */
export function parseRtfDocument(rtf: string): {
  lines: DocLine[];
  pictures: RtfPicture[];
} {
  const lines: DocLine[] = [];
  const pictures: RtfPicture[] = [];
  let segments: DocSegment[] = [{ text: '' }];
  let lineImageIds: string[] = [];
  /** Set by `\intbl`, cleared by `\pard` and `\row`. */
  let inTable = false;
  /** The `\pict` group being read, closed at its own depth. */
  let pict: {
    depth: number;
    kind: RtfPictureKind;
    hex: string[];
    binary: number[];
  } | null = null;

  const endLine = (): void => {
    const text = segments.map((s) => s.text).join(' ');
    const emphasized = segments.some((s) => s.emphasized);
    if (text.trim() || lineImageIds.length > 0)
      lines.push({
        text,
        ...(segments.length > 1 ? { segments } : {}),
        ...(emphasized ? { emphasized: true } : {}),
        ...(lineImageIds.length > 0 ? { imageIds: lineImageIds } : {}),
      });
    segments = [{ text: '' }];
    lineImageIds = [];
  };

  const closePicture = (): void => {
    if (!pict) return;
    const bytes =
      pict.binary.length > 0
        ? Uint8Array.from(pict.binary)
        : hexBytes(pict.hex);
    if (bytes.length > 0) {
      const id = `rtf-img-${pictures.length + 1}`;
      pictures.push({ id, kind: pict.kind, bytes });
      lineImageIds.push(id);
    }
    pict = null;
  };

  let state: State = {
    bold: false,
    underline: false,
    highlighted: false,
    uc: 1,
    ignore: false,
  };
  const stack: State[] = [];
  /** Set when a group opened with `\*`, so an unknown destination is dropped. */
  let pendingStar = false;
  /** Non-zero while inside a group we are throwing away. */
  let skipDepth = 0;
  let depth = 0;
  let decoder: TextDecoder | null = null;

  const append = (chunk: string): void => {
    if (state.ignore || skipDepth > 0 || !chunk) return;
    const current = segments[segments.length - 1];
    current.text += chunk;
    if (
      /[A-Za-z0-9]/.test(chunk) &&
      (state.bold || state.underline || state.highlighted)
    ) {
      current.emphasized = true;
    }
  };

  let i = 0;
  let atGroupStart = false;
  while (i < rtf.length) {
    const char = rtf[i];

    if (char === '{') {
      stack.push({ ...state });
      depth += 1;
      atGroupStart = true;
      pendingStar = false;
      i += 1;
      continue;
    }

    if (char === '}') {
      if (skipDepth > 0 && depth === skipDepth) skipDepth = 0;
      if (pict && depth === pict.depth) closePicture();
      const restored = stack.pop();
      if (restored) state = restored;
      depth -= 1;
      atGroupStart = false;
      i += 1;
      continue;
    }

    if (char === '\\') {
      const next = rtf[i + 1] ?? '';
      // A control symbol: one non-alphabetic character, never parameterised.
      if (!isAlpha(next)) {
        i += 2;
        if (next === '*') {
          // `{\*\foo` marks a destination the reader may drop whole.
          pendingStar = true;
          continue;
        }
        atGroupStart = false;
        if (next === '\\' || next === '{' || next === '}') append(next);
        else if (next === '~') append('\u00a0');
        else if (next === '_') append('-');
        else if (next === "'") {
          // Adjacent escapes are one run, so a double-byte character decodes whole.
          const bytes: number[] = [];
          for (;;) {
            const code = Number.parseInt(rtf.slice(i, i + 2), 16);
            i += 2;
            if (Number.isFinite(code)) bytes.push(code);
            if (rtf[i] !== '\\' || rtf[i + 1] !== "'") break;
            i += 2;
          }
          append(
            decoder
              ? decoder.decode(Uint8Array.from(bytes))
              : bytes
                  .map((code) => CP1252_HIGH[code] ?? String.fromCharCode(code))
                  .join('')
          );
        }
        continue;
      }

      // A control word, optionally negative-parameterised, with one optional
      // space as its delimiter.
      let j = i + 1;
      while (j < rtf.length && isAlpha(rtf[j])) j += 1;
      const word = rtf.slice(i + 1, j);
      let param: number | null = null;
      let k = j;
      if (rtf[k] === '-' || isDigit(rtf[k] ?? '')) {
        const start = k;
        if (rtf[k] === '-') k += 1;
        while (k < rtf.length && isDigit(rtf[k])) k += 1;
        param = Number.parseInt(rtf.slice(start, k), 10);
      }
      if (rtf[k] === ' ') k += 1;
      i = k;

      const wasGroupStart = atGroupStart;
      atGroupStart = false;

      if (skipDepth === 0 && wasGroupStart && !pict && word === 'pict') {
        pict = { depth, kind: 'other', hex: [], binary: [] };
        pendingStar = false;
        continue;
      }
      // Word's `{\*\shppict` holds the real picture; its `\nonshppict` twin is skipped.
      if (skipDepth === 0 && wasGroupStart && word === 'shppict') {
        pendingStar = false;
        continue;
      }

      // `{\*\foo` and `{\fonttbl` alike: the whole group goes.
      if (
        skipDepth === 0 &&
        wasGroupStart &&
        (pendingStar || IGNORED_DESTINATIONS.has(word))
      ) {
        skipDepth = depth;
        pendingStar = false;
        continue;
      }
      pendingStar = false;

      if (pict && skipDepth === 0) {
        if (word in PICTURE_KINDS) pict.kind = PICTURE_KINDS[word];
        else if (word === 'bin' && param && param > 0) {
          for (let b = 0; b < param && i + b < rtf.length; b += 1)
            pict.binary.push(rawByte(rtf.charCodeAt(i + b)));
          i += param;
        }
        continue;
      }

      if (word === 'bin' && param && param > 0) {
        i += param;
        continue;
      }
      if (skipDepth > 0) continue;

      if (word === 'u') {
        if (param !== null)
          append(String.fromCodePoint(param < 0 ? param + 65536 : param));
        // The substitute character that follows is the same glyph again.
        let skipped = 0;
        while (skipped < state.uc && i < rtf.length) {
          if (rtf[i] === '\\') {
            const after = rtf[i + 1] ?? '';
            if (after === "'") i += 4;
            else if (isAlpha(after)) {
              let e = i + 1;
              while (e < rtf.length && isAlpha(rtf[e])) e += 1;
              i = e;
            } else i += 2;
          } else if (rtf[i] === '{' || rtf[i] === '}') {
            break;
          } else {
            i += 1;
          }
          skipped += 1;
        }
        continue;
      }

      if (word === 'ansicpg') {
        if (param !== null) decoder = codepageDecoder(param);
        continue;
      }
      if (word === 'uc') {
        if (param !== null && param >= 0) state = { ...state, uc: param };
        continue;
      }
      if (word === 'intbl') {
        inTable = true;
        continue;
      }
      if (word === 'pard') {
        inTable = false;
        continue;
      }
      if (word === 'row') {
        inTable = false;
        // Every cell ends in `\cell`, so the row's last segment is always empty.
        const last = segments[segments.length - 1];
        if (segments.length > 1 && !last.text.trim()) segments.pop();
        endLine();
        continue;
      }
      if (SEGMENT_BREAKS.has(word)) {
        if (!state.ignore) segments.push({ text: '' });
        continue;
      }
      if (PARAGRAPH_BREAKS.has(word)) {
        if (inTable) append(' ');
        else endLine();
        continue;
      }
      if (word in LITERALS) {
        append(LITERALS[word]);
        continue;
      }
      if (word === 'plain') {
        state = { ...state, bold: false, underline: false, highlighted: false };
        continue;
      }
      if (word === 'b') {
        state = { ...state, bold: !isOff(param) };
        continue;
      }
      if (
        word === 'ul' ||
        word === 'uld' ||
        word === 'uldb' ||
        word === 'ulw'
      ) {
        state = { ...state, underline: !isOff(param) };
        continue;
      }
      if (word === 'ulnone') {
        state = { ...state, underline: false };
        continue;
      }
      if (word === 'highlight' || word === 'chcbpat') {
        state = { ...state, highlighted: param !== null && param > 0 };
        continue;
      }
      // Every other control word is layout we have no use for.
      continue;
    }

    if (pict && skipDepth === 0) {
      let end = i;
      while (
        end < rtf.length &&
        rtf[end] !== '\\' &&
        rtf[end] !== '{' &&
        rtf[end] !== '}'
      )
        end += 1;
      pict.hex.push(rtf.slice(i, end));
      i = end;
      atGroupStart = false;
      continue;
    }

    i += 1;
    if (char === '\r' || char === '\n') continue;
    atGroupStart = false;
    append(char);
  }

  endLine();
  return { lines, pictures };
}

/** RTF's own bytes are ASCII; anything else it writes as a `\'hh` escape. */
function blobText(file: Blob): Promise<string> {
  // `FileReader` rather than `Blob.text`, which older Safari does not have.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file, 'windows-1252');
  });
}

export async function readRtf(
  file: Blob
): Promise<{ lines: DocLine[]; pictures: RtfPicture[] }> {
  const raw = await blobText(file);
  if (!raw.trimStart().startsWith('{\\rtf')) {
    throw new Error(
      "This file couldn't be read as a rich text file. Try saving it again as .rtf."
    );
  }
  return parseRtfDocument(raw);
}
