// Splitting a typed PDF into versions without AI, the plain reader's take on the AI map (QUIZ_IMPORT_VERSIONS V7, V13).
import { parseDocument } from './parseQuestions';
import { figureKey, type FigureBox } from './pdfFigures';
import type { PdfContent } from './pdfReader';
import type { MappedVersion } from './testSetReader';
import type {
  AiExtractedRubric,
  AiRubricCriterion,
  DocLine,
  ExtractedQuestion,
  ReaderOptions,
  VersionGroup,
} from './types';

export const SHARED_KEY_SKIPPED =
  'An answer key here covers more than one version, so it wasn’t used. Add the answers in the editor.';

export const rubricPointsMissing = (letter: string): string =>
  `Row ${letter}’s points couldn’t be read. Set them in the rubric editor.`;

/** The marks `looksVersioned` counts; a letter must be a capital, so "form a hypothesis" isn't one. */
const LETTERED_MARK =
  /\b(?:[Vv]ersion|VERSION|[Ff]orm|FORM)\s+(?:[A-H]|\d{1,2})\b/;
const NAMED_MARK = /\b(?:reassessment|retake|split\s+pt\.?\s*\d)\b/i;
const RUBRIC_START = /^(?:rubric|scoring\s+guide(?:lines)?)\b/i;
const RUBRIC_END = /\b(?:rubric|scoring\s+guide)$/i;
const KEY_START = /^(?:answer\s+key|answers|key)\b\s*[:–-]?\s*(?:for\s+)?/i;
const KEY_END = /\banswer\s+key$/i;
/** A heading is a few words, never a numbered question, a sentence or a fill-in line. */
const MAX_HEADING_CHARS = 60;
const MAX_HEADING_WORDS = 6;

export type PlainSectionKind = 'version' | 'rubric' | 'answer-key';

export interface PlainSection {
  kind: PlainSectionKind;
  /** The heading as printed. */
  label: string;
  /** 1-based, in order. */
  pages: number[];
  /** The heading as printed, when `label` had a number added to tell it apart. */
  printed?: string;
}

const squash = (text: string): string =>
  text
    .replace(/[\u200b\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const labelKey = (text: string): string => squash(text).toLowerCase();
const markOf = (text: string): string | null => {
  const m = LETTERED_MARK.exec(text) ?? NAMED_MARK.exec(text);
  return m ? labelKey(m[0]) : null;
};

function headingOf(
  text: string
): { kind: PlainSectionKind; label: string } | null {
  const label = squash(text);
  if (!label || label.length > MAX_HEADING_CHARS) return null;
  if (label.split(' ').length > MAX_HEADING_WORDS) return null;
  // A wrapped sentence starts lower case or ends in punctuation.
  if (/_{3,}|\?|^\d{1,3}\s*[.)]|^[a-z]|[.,;]$/.test(label)) return null;
  const mark = markOf(label);
  const keyRest = label.replace(KEY_START, '');
  if (
    (keyRest !== label &&
      (!keyRest || markOf(keyRest) === labelKey(keyRest))) ||
    (mark && KEY_END.test(label))
  )
    return { kind: 'answer-key', label };
  if (RUBRIC_START.test(label) || (mark && RUBRIC_END.test(label)))
    return { kind: 'rubric', label };
  if (mark) return { kind: 'version', label };
  return null;
}

/** Sections start only at a heading near the top of a page; other pages continue the one before. */
export function mapPlainSections(
  pageHeads: readonly (readonly string[])[]
): PlainSection[] {
  const sections: PlainSection[] = [];
  pageHeads.forEach((heads, i) => {
    const page = i + 1;
    const found = heads.map(headingOf).find((h) => h !== null) ?? null;
    const last = sections[sections.length - 1];
    if (found) {
      // A version that prints its heading on every page is still one version.
      const same =
        last?.kind === 'version' &&
        found.kind === 'version' &&
        markOf(last.label) === markOf(found.label);
      if (!same || found.kind !== 'version') {
        sections.push({ ...found, pages: [page] });
        return;
      }
    }
    // Pages before the first heading are a cover or directions, read by no one.
    last?.pages.push(page);
  });
  return sections;
}

/** Two sections can't share a label, or groups and rubrics couldn't tell them apart. */
function uniqueLabels(sections: readonly PlainSection[]): PlainSection[] {
  const taken = new Set<string>();
  return sections.map((s) => {
    let label = s.label;
    for (let n = 2; taken.has(labelKey(label)); n++)
      label = `${s.label} (${n})`;
    taken.add(labelKey(label));
    return label === s.label ? s : { ...s, label, printed: s.label };
  });
}

/** Parallel forms, retakes and a split, judged from the headings alone (V8). */
export function plainGroups(
  labels: readonly string[],
  title: string
): VersionGroup[] {
  const parallel: number[] = [];
  const retake: number[] = [];
  const split: number[] = [];
  labels.forEach((label, i) => {
    if (/\b(?:reassessment|retake|make-?up)\b/i.test(label)) retake.push(i);
    else if (/\b(?:pt|part)\.?\s*\d\b/i.test(label)) split.push(i);
    else parallel.push(i);
  });
  const groups: VersionGroup[] = [];
  if (parallel.length > 0)
    groups.push({ kind: 'parallel', name: title, versions: parallel });
  if (retake.length > 0)
    groups.push({ kind: 'retake', name: title, versions: retake });
  if (split.length > 1)
    groups.push({ kind: 'split', name: `${title} Split`, versions: split });
  else if (split.length === 1) {
    if (groups[0]) groups[0].versions.push(split[0]);
    else groups.push({ kind: 'parallel', name: title, versions: split });
  }
  return groups;
}

const BULLET = /^[-•○◦▪●*–]\s*/;
const BLANK_LINE = /^[_\s.]*$/;
const NAME_LINE = /^(?:name|date|period|class|hour)\s*:/i;
const POINTS_AT_END = /(?:^|\s)(?:\d{1,2}\s*)?\/\s*(\d{1,2})\s*$/;
const POINTS_ONLY = /^(?:\d{1,2}\s*)?\/\s*\d{1,2}$/;

/**
 * One rubric table, read row by row: a lettered row starts a criterion, its
 * "Credit received for" bullets and "NOT ACCEPTABLE" lines are kept verbatim (V2, V3).
 */
export function readPlainRubric(
  lines: readonly DocLine[],
  section: Pick<PlainSection, 'label' | 'pages' | 'printed'>
): AiExtractedRubric {
  const heading = labelKey(section.printed ?? section.label);
  const criteria: AiRubricCriterion[] = [];
  let printedTotal: number | undefined;
  let mode: 'prompt' | 'credit' | 'note' | 'skip' = 'skip';
  let current: AiRubricCriterion | null = null;
  let pointsFound = false;
  const close = () => {
    if (current && !pointsFound) current.points = 0;
  };
  const nextLetter = () => String.fromCharCode(65 + criteria.length);

  for (const line of lines) {
    let text = squash(line.text);
    if (!text) continue;
    if (labelKey(text) === heading) continue;
    if (/^#?\s*criteria\b.*\bpoints$/i.test(text)) continue;
    const pts = POINTS_AT_END.exec(text);
    const start = new RegExp(`^${nextLetter()}[.):]?\\s+(\\S.*)$`).exec(text);
    // The first row must look like a table row, so an intro line starting "A complete…" isn't one.
    const rowStart =
      start !== null &&
      (criteria.length > 0 || pts !== null || (line.segments?.length ?? 0) > 1);
    if (
      !rowStart &&
      /^(?:name:\s*)?(?:[\w ]*\b)?(?:total|final)\b/i.test(text) &&
      pts
    ) {
      printedTotal = Number(pts[1]);
      mode = 'skip';
      continue;
    }
    if (start && rowStart) {
      close();
      current = {
        letter: nextLetter(),
        prompt: '',
        points: 0,
        credit: [],
        notes: [],
      };
      criteria.push(current);
      pointsFound = false;
      mode = 'prompt';
      text = start[1];
    }
    if (!current) continue;
    // A fraction in a credit line ("the ratio 3/4") is not the row's points.
    if (pts && (start || mode === 'prompt' || POINTS_ONLY.test(text))) {
      current.points = Number(pts[1]);
      pointsFound = true;
      text = text.replace(POINTS_AT_END, '').trim();
    } else if (mode === 'prompt' && line.segments && line.segments.length > 1) {
      // The "0" of a "0 /2" points column whose "/2" wrapped to the next line.
      const lastSeg = squash(line.segments[line.segments.length - 1].text);
      if (/^\d{1,2}$/.test(lastSeg)) text = text.replace(/\s+\d{1,2}$/, '');
    }
    if (!text) continue;
    if (/^teacher\s+comments\b/i.test(text)) {
      mode = 'skip';
      continue;
    }
    if (/^credit\s+(?:received|given|awarded)\s+for\b/i.test(text)) {
      mode = 'credit';
      continue;
    }
    if (
      /^(?:not\s+acceptable|no\s+(?:points|credit)|do\s+not\s+(?:accept|award))\b/i.test(
        text
      )
    ) {
      current.notes.push(text);
      mode = 'note';
      continue;
    }
    if (mode === 'prompt') {
      current.prompt = squash(`${current.prompt} ${text}`);
    } else if (mode === 'credit' && BULLET.test(text)) {
      const item = text.replace(BULLET, '').trim();
      if (item) current.credit.push(item);
    } else if (mode === 'credit' && current.credit.length > 0) {
      const at = current.credit.length - 1;
      current.credit[at] = `${current.credit[at]} ${text}`;
    } else if (mode === 'note' && BULLET.test(text)) {
      current.notes.push(text.replace(BULLET, '').trim());
    } else if (mode === 'note' && current.notes.length > 0) {
      const at = current.notes.length - 1;
      current.notes[at] = `${current.notes[at]} ${text}`;
    }
  }
  close();

  const warnings = criteria
    .filter((c) => c.points === 0)
    .map((c) => rubricPointsMissing(c.letter));
  return {
    label: section.label,
    pages: {
      start: section.pages[0],
      end: section.pages[section.pages.length - 1],
    },
    title: section.label,
    ...(printedTotal ? { printedTotal } : {}),
    criteria,
    warnings,
  };
}

/** A version with no numbered questions is one written response holding its text (V1). */
export function writtenResponseText(lines: readonly DocLine[]): string {
  const out: string[] = [];
  let lastY: number | undefined;
  let lastPage: number | undefined;
  for (const line of lines) {
    const text = squash(line.text);
    if (!text || BLANK_LINE.test(text) || NAME_LINE.test(text)) continue;
    const gap =
      lastY !== undefined && line.y !== undefined && line.page === lastPage
        ? lastY - line.y
        : 0;
    const startsItem =
      /^(?:[A-Za-z]|\d{1,2})[.)]\s/.test(text) || BULLET.test(text);
    if (out.length === 0 || startsItem || gap > 20 || line.page !== lastPage)
      out.push(text);
    else out[out.length - 1] = `${out[out.length - 1]} ${text}`;
    lastY = line.y;
    lastPage = line.page;
  }
  return out.join('\n');
}

/** The heading leaves the text on every page it tops, since a version may print it on each. */
function withoutHeading(lines: readonly DocLine[], label: string): DocLine[] {
  const seenOnPage = new Map<number | undefined, number>();
  return lines.filter((l) => {
    const index = seenOnPage.get(l.page) ?? 0;
    if (squash(l.text)) seenOnPage.set(l.page, index + 1);
    return !(index < 3 && labelKey(l.text) === labelKey(label));
  });
}

export interface PlainVersionRead {
  versions: MappedVersion[];
  rubrics: AiExtractedRubric[];
  groups: VersionGroup[];
  warnings: string[];
}

/**
 * The plain read of a PDF with versions, or null when it has fewer than two.
 * Each version is parsed alone, so its own key and pictures stay with it.
 */
export function splitPlainVersions(
  content: Pick<PdfContent, 'lines' | 'pictures' | 'pageHeads'>,
  title: string,
  reader: ReaderOptions
): PlainVersionRead | null {
  const sections = uniqueLabels(mapPlainSections(content.pageHeads));
  const versionSections = sections.filter((s) => s.kind === 'version');
  if (
    new Set(versionSections.map((s) => markOf(s.label) ?? labelKey(s.label)))
      .size < 2
  )
    return null;

  const warnings: string[] = [];
  const linesOf = (pages: readonly number[]) =>
    content.lines.filter((l) => l.page !== undefined && pages.includes(l.page));

  // A key goes to the version its heading names, else the one just before it.
  const keyPages = new Map<number, number[]>();
  let lastVersion = -1;
  const keysPerVersion = new Map<number, number>();
  const pending: { section: PlainSection; version: number }[] = [];
  for (const s of sections) {
    if (s.kind === 'version') {
      lastVersion = versionSections.indexOf(s);
      continue;
    }
    if (s.kind !== 'answer-key') continue;
    const mark = markOf(s.label);
    const named = mark
      ? versionSections.findIndex((v) => markOf(v.label) === mark)
      : -1;
    const version = mark ? named : lastVersion;
    if (version < 0) {
      warnings.push(SHARED_KEY_SKIPPED);
      continue;
    }
    pending.push({ section: s, version });
    keysPerVersion.set(version, (keysPerVersion.get(version) ?? 0) + 1);
  }
  // An unnamed key at the back with versions that have no key of their own covers several.
  const unkeyed = versionSections.some((_, i) => !keysPerVersion.has(i));
  for (const { section, version } of pending) {
    if (
      !markOf(section.label) &&
      unkeyed &&
      version === versionSections.length - 1
    ) {
      warnings.push(SHARED_KEY_SKIPPED);
      continue;
    }
    keyPages.set(version, [...(keyPages.get(version) ?? []), ...section.pages]);
  }

  const boxByKey = new Map(content.pictures.map((b) => [figureKey(b), b]));
  const versions = versionSections.map((s, i): MappedVersion => {
    const own = withoutHeading(linesOf(s.pages), s.printed ?? s.label);
    const lines = [...own, ...linesOf(keyPages.get(i) ?? [])];
    const parsed = parseDocument(lines, reader);
    const sharedText = new Map(parsed.texts.map((t) => [t.id, t.text]));
    // A version carries no shared passages, so each question keeps its own copy.
    let questions: ExtractedQuestion[] = parsed.questions.map((q) => {
      const passage = q.sharedTextId
        ? sharedText.get(q.sharedTextId)
        : undefined;
      const next = {
        ...q,
        ...(passage ? { text: `${passage}\n\n${q.text}` } : {}),
      };
      delete next.sharedTextId;
      return next;
    });
    if (!questions.some((q) => q.text.trim())) {
      const text = writtenResponseText(own);
      const imageIds = [...new Set(own.flatMap((l) => l.imageIds ?? []))];
      questions = text
        ? [
            {
              number: 1,
              text,
              type: 'free-response',
              options: [],
              correctAnswer: '',
              imageIds,
              warnings: [],
            },
          ]
        : [];
    }
    const figures: FigureBox[][] = questions.map((q) =>
      q.imageIds.flatMap((id) => {
        const box = boxByKey.get(id);
        return box ? [box] : [];
      })
    );
    return {
      label: s.label,
      title: s.label,
      warnings: parsed.warnings,
      questions: questions.map((q) => ({ ...q, imageIds: [] })),
      figures,
    };
  });

  const rubrics = sections
    .filter((s) => s.kind === 'rubric')
    .map((s) => readPlainRubric(linesOf(s.pages), s));

  return {
    versions,
    rubrics,
    groups: plainGroups(
      versions.map((v) => v.label),
      title
    ),
    warnings,
  };
}
