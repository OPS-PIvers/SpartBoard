// The stimuli a printed test paper carries: each prints once, above the first question that uses it.
import type { QuizQuestion, QuizStimulus } from '@/types';
import { parseWordBank, wordBankColumns } from './quizWordBank';

/** One stimulus as the test paper prints it. */
export type PaperTestStimulus =
  | { kind: 'text'; title?: string; text: string }
  | {
      kind: 'word-bank';
      title?: string;
      groups: string[][];
      columns: 1 | 2 | 3;
    }
  | { kind: 'image'; title?: string; src: string }
  | { kind: 'pages'; title?: string; srcs: string[] }
  | { kind: 'link'; title: string; url: string };

/** Stimuli printed above a question, with the printed numbers of every question that uses them. */
export interface PaperTestStimulusBlock {
  forRows: readonly (number | string)[];
  items: PaperTestStimulus[];
}

/** Pictures fetched before the print window opens, by stimulus id. */
export interface PaperTestStimulusFiles {
  images: Readonly<Record<string, string>>;
  /** A PDF, Doc or Slides file rendered page by page. */
  pages: Readonly<Record<string, readonly string[]>>;
}

/** Stimuli whose content has to be fetched and drawn before printing. */
export function isFetchedStimulus(s: QuizStimulus): boolean {
  if (s.type === 'image' || s.type === 'pdf') return !!s.driveFileId || !!s.url;
  return s.type === 'gdoc-embed' && !!s.driveFileId;
}

const GDOC_KIND = /docs\.google\.com\/(document|presentation|spreadsheets)\//i;

/** What a stimulus that can't print on paper is called next to its link. */
export function stimulusLinkTitle(s: QuizStimulus): string {
  const named = s.tabLabel?.trim();
  if (named) return named;
  switch (s.type) {
    case 'video':
    case 'youtube':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'image':
      return 'Image';
    case 'pdf':
      return 'PDF';
    case 'gdoc-embed': {
      const kind = GDOC_KIND.exec(s.url)?.[1]?.toLowerCase();
      if (kind === 'presentation') return 'Google Slides';
      if (kind === 'spreadsheets') return 'Google Sheets';
      return 'Google Doc';
    }
    default:
      return 'Link';
  }
}

/** A link a student can type: the Drive file's address when the stimulus has no URL of its own. */
function stimulusLink(s: QuizStimulus): string {
  if (s.url && !/^(data|blob):/i.test(s.url)) return s.url;
  return s.driveFileId
    ? `https://drive.google.com/file/d/${s.driveFileId}/view`
    : '';
}

/** How one stimulus prints; null for one with nothing to put on paper. */
export function paperTestStimulus(
  s: QuizStimulus,
  files: PaperTestStimulusFiles
): PaperTestStimulus | null {
  const title = s.tabLabel?.trim();
  const withTitle = title ? { title } : {};
  switch (s.type) {
    case 'text': {
      const text = s.text?.trim();
      return text ? { kind: 'text', ...withTitle, text } : null;
    }
    case 'word-bank': {
      const groups = parseWordBank(s.text);
      return groups.length
        ? {
            kind: 'word-bank',
            ...withTitle,
            groups,
            columns: wordBankColumns(s.wordBankColumns),
          }
        : null;
    }
    // A calculator is a device tool, so paper has nothing to show for it.
    case 'calculator':
      return null;
    default:
      break;
  }
  const image = files.images[s.id];
  if (image) return { kind: 'image', ...withTitle, src: image };
  const pages = files.pages[s.id];
  if (pages?.length) return { kind: 'pages', ...withTitle, srcs: [...pages] };
  const url = stimulusLink(s);
  return url ? { kind: 'link', title: stimulusLinkTitle(s), url } : null;
}

/** A printed question as `attachPaperTestStimuli` needs it. */
export interface PrintedQuestionRef {
  questionId: string;
  row: number | string;
}

/** Per printed question: the shared stimuli printed above it and the pictures printed in it. */
export interface PrintedQuestionStimuli {
  block?: PaperTestStimulusBlock;
  inline?: PaperTestStimulus[];
}

/**
 * Places each stimulus once, above the first printed question that uses it.
 * An image the teacher put in the question prints inside each question, as students see it.
 */
export function attachPaperTestStimuli(
  printed: readonly PrintedQuestionRef[],
  questionsById: ReadonlyMap<string, Pick<QuizQuestion, 'id' | 'stimulusIds'>>,
  stimuli: readonly QuizStimulus[],
  files: PaperTestStimulusFiles
): Map<string, PrintedQuestionStimuli> {
  const byId = new Map(stimuli.map((s) => [s.id, s]));
  const rowsFor = new Map<string, (number | string)[]>();
  for (const p of printed) {
    for (const id of questionsById.get(p.questionId)?.stimulusIds ?? []) {
      if (!byId.has(id)) continue;
      const rows = rowsFor.get(id) ?? [];
      rows.push(p.row);
      rowsFor.set(id, rows);
    }
  }
  const placed = new Set<string>();
  const out = new Map<string, PrintedQuestionStimuli>();
  for (const p of printed) {
    const ids = questionsById.get(p.questionId)?.stimulusIds ?? [];
    const blockItems: PaperTestStimulus[] = [];
    const blockRows: (number | string)[] = [];
    const inline: PaperTestStimulus[] = [];
    for (const id of ids) {
      const s = byId.get(id);
      if (!s) continue;
      if (s.type === 'image' && s.placement === 'inline') {
        const item = paperTestStimulus(s, files);
        if (item) inline.push(item);
        continue;
      }
      if (placed.has(id)) continue;
      placed.add(id);
      const item = paperTestStimulus(s, files);
      if (!item) continue;
      blockItems.push(item);
      for (const row of rowsFor.get(id) ?? [])
        if (!blockRows.includes(row)) blockRows.push(row);
    }
    const entry: PrintedQuestionStimuli = {
      ...(blockItems.length
        ? { block: { forRows: blockRows, items: blockItems } }
        : {}),
      ...(inline.length ? { inline } : {}),
    };
    if (entry.block || entry.inline) out.set(p.questionId, entry);
  }
  return out;
}

/** "For question 3", "For questions 3 to 5", "For questions 2, 4 and 7 to 9". */
export function stimulusForLine(rows: readonly (number | string)[]): string {
  if (rows.length === 0) return '';
  if (rows.length === 1) return `For question ${rows[0]}`;
  const num = (r: number | string | undefined): number | null =>
    typeof r === 'number'
      ? r
      : r !== undefined && /^\d+$/.test(r)
        ? Number(r)
        : null;
  const parts: string[] = [];
  let i = 0;
  while (i < rows.length) {
    let end = i;
    for (;;) {
      const a = num(rows[end]);
      const b = num(rows[end + 1]);
      if (a === null || b === null || b !== a + 1) break;
      end += 1;
    }
    if (end - i >= 2) parts.push(`${rows[i]} to ${rows[end]}`);
    else for (let k = i; k <= end; k += 1) parts.push(String(rows[k]));
    i = end + 1;
  }
  const last = parts.pop();
  return `For questions ${parts.length ? `${parts.join(', ')} and ${last}` : last}`;
}
