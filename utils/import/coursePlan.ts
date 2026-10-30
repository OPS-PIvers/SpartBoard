// Plans a whole-course import from a Schoology export (docs/plans/IMPORT.md D19–D24): one row per item, each with its own target.

import type { LibraryFolder } from '@/types';
import type { CartridgeBank, CourseMaterial } from '@/utils/quizDocumentImport';
import { folderNames } from '@/utils/cartridgeBankImport';
import { looksLikeTwoColumns } from './guessTargets';
import { MAX_AI_CONVERSIONS_PER_IMPORT } from './contract';

export type CourseRowKind =
  'quiz' | 'bank' | 'page' | 'file' | 'link' | 'discussion';

/** Where a row goes; `skip` leaves it out. */
export type CourseRowTarget =
  | 'quiz'
  | 'questionBank'
  | 'flashcards'
  | 'activityWall'
  | 'pdf'
  | 'links'
  | 'skip';

export interface CourseRow {
  /** Unique within the export: the kind plus the manifest's resource id. */
  id: string;
  kind: CourseRowKind;
  title: string;
  /** Library folders from the root, the course folder first. */
  path: string[];
  options: CourseRowTarget[];
  guess: CourseRowTarget;
  /** Quizzes and banks only: questions read, and none means Schoology left them out. */
  questionCount?: number;
  bank?: CartridgeBank;
  material?: CourseMaterial;
  /** Its library already holds an item with this title in the same folder. */
  duplicate?: boolean;
}

export interface CourseRowAccess {
  /** Widgets this teacher may use, by import target. */
  target: (target: Exclude<CourseRowTarget, 'skip'>) => boolean;
  /** AI Conversion is on for this teacher (the flag and the admin switch). */
  ai: boolean;
  /** Drive is connected, so Word, PowerPoint and Excel files can be shown in the PDF viewer. */
  drive: boolean;
}

/** Targets that run an AI Conversion for this kind of row. */
export const isAiTarget = (
  kind: CourseRowKind,
  target: CourseRowTarget
): boolean =>
  kind === 'page' && (target === 'flashcards' || target === 'activityWall');

const PDF_FILE = /\.pdf$/i;
const OFFICE_FILE = /\.(docx?|pptx?|xlsx?)$/i;

function optionsFor(
  kind: CourseRowKind,
  item: { questionCount?: number; material?: CourseMaterial },
  access: CourseRowAccess
): CourseRowTarget[] {
  const offered = (targets: Exclude<CourseRowTarget, 'skip'>[]) => [
    ...targets.filter((t) => access.target(t)),
    'skip' as const,
  ];
  switch (kind) {
    case 'quiz':
      return item.questionCount ? offered(['quiz', 'questionBank']) : ['skip'];
    case 'bank':
      return item.questionCount ? offered(['questionBank']) : ['skip'];
    case 'discussion':
      return offered(['activityWall']);
    case 'link':
      return offered(['links']);
    case 'file': {
      const name = item.material?.fileName ?? '';
      if (PDF_FILE.test(name) || (access.drive && OFFICE_FILE.test(name)))
        return offered(['pdf']);
      return ['skip'];
    }
    case 'page':
      return access.ai && item.material?.text?.trim()
        ? offered(['flashcards', 'activityWall'])
        : ['skip'];
  }
}

/** Pages start on Skip unless they read as terms and definitions, so AI runs only for pages the teacher picks. */
function guessFor(
  kind: CourseRowKind,
  options: CourseRowTarget[],
  material?: CourseMaterial
): CourseRowTarget {
  if (kind === 'page') {
    const lines = (material?.text ?? '').split('\n');
    return options.includes('flashcards') && looksLikeTwoColumns(lines)
      ? 'flashcards'
      : 'skip';
  }
  return options[0];
}

export function planCourseImport(
  courseName: string,
  tests: readonly CartridgeBank[],
  banks: readonly CartridgeBank[],
  materials: readonly CourseMaterial[],
  access: CourseRowAccess
): CourseRow[] {
  const root = courseName.trim();
  const pathOf = (folderPath: readonly string[]) =>
    [root, ...folderPath].filter((n) => n.trim());
  const row = (
    kind: CourseRowKind,
    id: string,
    title: string,
    folderPath: readonly string[],
    extra: Pick<CourseRow, 'bank' | 'material' | 'questionCount'>
  ): CourseRow => {
    const options = optionsFor(kind, extra, access);
    return {
      id: `${kind}:${id}`,
      kind,
      title,
      path: pathOf(folderPath),
      options,
      guess: guessFor(kind, options, extra.material),
      ...extra,
    };
  };
  const rows = [
    ...tests.map((t) =>
      row('quiz', t.id, t.title, t.folderPath, {
        bank: t,
        questionCount: t.questions.length,
      })
    ),
    ...banks.map((b) =>
      row('bank', b.id, b.title, b.folderPath, {
        bank: b,
        questionCount: b.questions.length,
      })
    ),
    ...materials.map((m) =>
      row(m.kind, m.id, m.title, m.folderPath, { material: m })
    ),
  ];
  // Rows keep Schoology's folder order: each folder's items sit together.
  const firstSeen = new Map<string, number>();
  rows.forEach((r, i) => {
    const key = r.path.join('\u0000');
    if (!firstSeen.has(key)) firstSeen.set(key, i);
  });
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const fa = firstSeen.get(a.r.path.join('\u0000')) ?? 0;
      const fb = firstSeen.get(b.r.path.join('\u0000')) ?? 0;
      return fa - fb || a.i - b.i;
    })
    .map(({ r }) => r);
}

/** The teacher's pick, or the guess. */
export const targetOf = (
  row: CourseRow,
  picks: ReadonlyMap<string, CourseRowTarget>
): CourseRowTarget => picks.get(row.id) ?? row.guess;

/** Rows to save now, and AI rows split into the first queue (D28's 25) and the rest. */
export function splitCourseRows(
  rows: readonly CourseRow[],
  picks: ReadonlyMap<string, CourseRowTarget>
): { parser: CourseRow[]; ai: CourseRow[] } {
  const chosen = rows.filter((r) => targetOf(r, picks) !== 'skip');
  return {
    parser: chosen.filter((r) => !isAiTarget(r.kind, targetOf(r, picks))),
    ai: chosen.filter((r) => isAiTarget(r.kind, targetOf(r, picks))),
  };
}

/** The next batch of AI reviews; the rest wait until the teacher continues. */
export const nextAiBatch = <T>(queue: readonly T[]): T[] =>
  queue.slice(0, MAX_AI_CONVERSIONS_PER_IMPORT);

/** The library folder an item lands in already holds one with this title. */
export function isDuplicate(
  path: readonly string[],
  title: string,
  existing: readonly { title: string; folderId?: string | null }[],
  folders: readonly LibraryFolder[]
): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const want = [...path, title].map(norm).join('\u0000');
  return existing.some(
    (e) =>
      [...folderNames(e.folderId, folders), e.title]
        .map(norm)
        .join('\u0000') === want
  );
}
