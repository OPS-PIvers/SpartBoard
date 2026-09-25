/**
 * The answer-key shapes a key file can take beyond a plain numbered list
 * (docs/plans/QUIZ_IMPORT_RELIABILITY.md R11, R12): publisher item blocks
 * (`ITEM 3 … Correct Answer: c`) read from their own table column, and
 * header-aware key tables (`# | Answer | Vocabulary word`).
 */

import {
  isHeading,
  keySectionHeading,
  listKeyItems,
  withKeySections,
  type RawKeyItem,
} from './answerKey';
import { bandOf, columnBands } from './pdfLayout';
import {
  lineSegments,
  type DocLine,
  type DocSegment,
  type KeyItem,
  type ReaderOptions,
} from './types';

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** `ITEM 3`, `Item 3`, `Question 3` opening a block. */
const ITEM_OPEN = /^\s*(?:item|question)\s+(\d{1,3})\b\s*[:.)]?\s*(.*)$/i;
const PART_SPLIT = /\bpart\s+([a-d])\b\s*[:.)]?/gi;
const CORRECT = /\bcorrect\s+answers?\s*:\s*/i;
/** Where the answer text stops inside a block. */
const ANSWER_END =
  /\b(?:distractor|scoring|rationale|explanation|standards?|dok|part\s+[a-d]\b)/i;
const POINTS = /\b(\d{1,2})\s*(?:points?|pts?)\b/i;
const NOT_SCORED = /\bnot\s+scored\b|\banswers?\s+(?:will|may)\s+vary\b/i;
const RUBRIC =
  /\brubric\b|\bsample\s+(?:answer|response)\b|\b[0-4]\s*(?:points?|pts?)\s*[:\-–]/i;

/** A column band per page (PDF) or a column index (Word, RTF). */
type Column =
  | { kind: 'band'; bands: Map<number, number[]>; band: Map<number, number> }
  | { kind: 'index'; index: number };

function pageOf(line: DocLine): number {
  return line.page ?? 0;
}

/** The segment of `line` that sits in `column`, or null. */
function cellIn(line: DocLine, column: Column): DocSegment | null {
  const segments = lineSegments(line);
  if (column.kind === 'index') return segments[column.index] ?? null;
  const bands = column.bands.get(pageOf(line));
  const band = column.band.get(pageOf(line));
  if (!bands || band === undefined) return null;
  const inBand = segments.filter(
    (s) => s.x !== undefined && bandOf(bands, s.x) === band
  );
  if (inBand.length === 0) return null;
  return { text: inBand.map((s) => s.text).join(' ') };
}

/** Letters, `a, b`, or `c <text>` after "Correct Answer:". */
function answerFrom(raw: string): Pick<KeyItem, 'answer' | 'ordering'> {
  const text = tidy(raw.split(ANSWER_END)[0] ?? '');
  // `1 first event 2 second event …`: an ordering answer.
  const ordered = [
    ...text.matchAll(/(?:^|\s)(\d{1,2})[.)]?\s+(.+?)(?=\s+\d{1,2}[.)]?\s+|$)/g),
  ];
  if (ordered.length >= 2 && ordered.every((m, i) => Number(m[1]) === i + 1)) {
    return { answer: '', ordering: ordered.map((m) => tidy(m[2])) };
  }
  const list = /^([a-f])(?:\s*(?:,|and|&)\s*([a-f]))+\b/i.exec(text);
  if (list) {
    const letters = text.slice(0, list[0].length).toUpperCase().match(/[A-F]/g);
    return { answer: (letters ?? []).join(', ') };
  }
  const letter = /^([a-f])\b[.)]?(?:\s|$)/i.exec(text);
  if (letter) return { answer: letter[1].toUpperCase() };
  if (/^(?:true|false)\b/i.test(text)) {
    return { answer: /^true/i.test(text) ? 'True' : 'False' };
  }
  return { answer: text };
}

/** One item block's text into key items, one per part. */
function itemsFromBlock(
  item: number,
  text: string,
  /** The block's rows across every column, where a Scoring Rules column prints points. */
  rows: string
): KeyItem[] {
  const points = POINTS.exec(text) ?? POINTS.exec(rows);
  const flags = {
    ...(points ? { points: Number(points[1]) } : {}),
    ...(RUBRIC.test(text) ? { rubric: true } : {}),
    ...(NOT_SCORED.test(text) ? { notScored: true } : {}),
  };
  const parts = [...text.matchAll(PART_SPLIT)];
  const pieces: Array<{ part?: string; text: string }> =
    parts.length === 0
      ? [{ text }]
      : parts.map((m, i) => ({
          part: m[1].toUpperCase(),
          text: text.slice(
            (m.index ?? 0) + m[0].length,
            parts[i + 1]?.index ?? text.length
          ),
        }));
  // A block's points are the whole item's when it has parts (R12).
  const shared =
    pieces.length > 1 && flags.points !== undefined
      ? { pointsForItem: true }
      : {};
  const items: KeyItem[] = [];
  for (const piece of pieces) {
    const correct = CORRECT.exec(piece.text);
    // "Question 3: B" with nothing else is a list entry in block form.
    const bare = /^\s*[:.)\-–]?\s*([a-f]|true|false)\s*$/i.exec(piece.text);
    const answer = correct
      ? answerFrom(piece.text.slice((correct.index ?? 0) + correct[0].length))
      : bare
        ? answerFrom(bare[1])
        : { answer: '' };
    items.push({
      item,
      ...(piece.part ? { part: piece.part } : {}),
      ...answer,
      ...flags,
      ...shared,
    });
  }
  return items;
}

/**
 * Publisher item blocks (R11.3): an `ITEM n` column holding the stem and the
 * correct answer, beside Distractor Analysis and Scoring Rules columns that
 * are ignored. Only the column the ITEM lines sit in is read.
 */
export function itemBlockKey(lines: readonly DocLine[]): KeyItem[] {
  const opens = lines
    .map((line, i) => ({
      line,
      i,
      seg: lineSegments(line).findIndex((s) => ITEM_OPEN.test(s.text)),
    }))
    .filter((o) => o.seg !== -1);
  if (opens.length === 0) return [];

  const positioned = opens.some(
    (o) => lineSegments(o.line)[o.seg].x !== undefined
  );
  let column: Column;
  if (positioned) {
    const bands = new Map<number, number[]>();
    const band = new Map<number, number>();
    const byPage = new Map<number, number[]>();
    for (const line of lines) {
      for (const s of lineSegments(line)) {
        if (s.x === undefined) continue;
        const xs = byPage.get(pageOf(line)) ?? [];
        xs.push(s.x);
        byPage.set(pageOf(line), xs);
      }
    }
    for (const [page, xs] of byPage) bands.set(page, columnBands(xs));
    for (const o of opens) {
      const x = lineSegments(o.line)[o.seg].x ?? 0;
      const pageBands = bands.get(pageOf(o.line)) ?? [];
      if (!band.has(pageOf(o.line)))
        band.set(pageOf(o.line), bandOf(pageBands, x));
    }
    column = { kind: 'band', bands, band };
  } else {
    column = { kind: 'index', index: opens[0].seg };
  }

  const raws: RawKeyItem[] = [];
  let open: { item: number; parts: string[]; rows: string[] } | null = null;
  const close = () => {
    if (open) {
      raws.push(
        ...itemsFromBlock(
          open.item,
          tidy(open.parts.join(' ')),
          open.rows.join(' ')
        )
      );
    }
    open = null;
  };
  for (const line of lines) {
    // "Section 2" printed across the table, or in the ITEM column.
    const heading = keySectionHeading(tidy(lineSegments(line)[0]?.text ?? ''));
    if (heading && !ITEM_OPEN.test(line.text)) {
      close();
      raws.push({ heading });
      continue;
    }
    const text = tidy(cellIn(line, column)?.text ?? '');
    const opening = ITEM_OPEN.exec(text);
    if (!opening) open?.rows.push(line.text);
    if (!text) continue;
    if (opening) {
      close();
      open = {
        item: Number(opening[1]),
        parts: [opening[2]],
        rows: [line.text],
      };
      continue;
    }
    open?.parts.push(text);
  }
  close();
  return withKeySections(raws);
}

const NUMBER_HEADER =
  /^(?:#|no\.?|nos?\.?|number|num\.?|question\s*#?|questions?|items?|q\s*#?)$/i;
const ANSWER_HEADER = /^(?:answers?|keys?|correct(?:\s+answers?)?|ans\.?)$/i;
const POINTS_HEADER = /^(?:points?|pts\.?|score|value)$/i;

/**
 * Header-aware key tables (R11.4): a header row naming a number column and an
 * answer column, repeated side by side or not. Other columns are ignored.
 */
export function tableKey(lines: readonly DocLine[]): KeyItem[] {
  const items: RawKeyItem[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const header = lineSegments(lines[i]).map((s) => tidy(s.text));
    const pairs: Array<{ number: number; answer: number; points?: number }> =
      [];
    header.forEach((cell, c) => {
      if (!NUMBER_HEADER.test(cell)) return;
      const answer = header.findIndex((h, j) => j > c && ANSWER_HEADER.test(h));
      if (answer === -1) return;
      const nextNumber = header.findIndex(
        (h, j) => j > c && NUMBER_HEADER.test(h)
      );
      if (nextNumber !== -1 && nextNumber < answer) return;
      const points = header.findIndex(
        (h, j) =>
          j > answer &&
          POINTS_HEADER.test(h) &&
          (nextNumber === -1 || j < nextNumber)
      );
      pairs.push({ number: c, answer, ...(points !== -1 ? { points } : {}) });
    });
    if (pairs.length === 0) continue;

    const positions = lineSegments(lines[i]).map((s) => s.x);
    const cellsOf = (line: DocLine): string[] => {
      const segments = lineSegments(line);
      if (positions.every((x) => x === undefined)) {
        return segments.map((s) => tidy(s.text));
      }
      // A PDF row: each segment goes to the header column it starts under.
      const cells = header.map(() => '');
      for (const s of segments) {
        if (s.x === undefined) continue;
        let best = 0;
        positions.forEach((x, c) => {
          if (x !== undefined && s.x !== undefined && x <= s.x + 4) best = c;
        });
        cells[best] = tidy(`${cells[best]} ${s.text}`);
      }
      return cells;
    };

    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const cells = cellsOf(lines[j]);
      let any = false;
      for (const pair of pairs) {
        const n = /^\s*(\d{1,3})\s*[.)]?\s*$/.exec(cells[pair.number] ?? '');
        if (!n) continue;
        any = true;
        const answer = answerFrom(cells[pair.answer] ?? '');
        const points =
          pair.points !== undefined
            ? Number.parseFloat(cells[pair.points] ?? '')
            : Number.NaN;
        items.push({
          item: Number(n[1]),
          ...answer,
          ...(Number.isFinite(points) ? { points } : {}),
        });
      }
      if (!any) break;
    }
    i = j - 1;
  }
  return withKeySections(items);
}

/**
 * Every answer a key file gives (R11): a test bank's answer section, publisher
 * item blocks, a headed key table, or a numbered list, in that order of trust.
 */
export function readKeyItems(
  lines: readonly DocLine[],
  options: ReaderOptions = {}
): KeyItem[] {
  const blocks = itemBlockKey(lines);
  if (blocks.some((k) => k.answer || k.ordering)) return blocks;
  const table = tableKey(lines);
  if (table.length > 0) return table;
  const list = listKeyItems(lines, options);
  if (list.length > 0 || !lines.some((l) => isHeading(l.text))) return list;
  return blocks;
}
