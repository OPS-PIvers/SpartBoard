// Plans a bulk question-bank or quiz import from an LMS collection export (.imscc).

import type { LibraryFolder } from '@/types';
import {
  questionNeedsKey,
  type CartridgeBank,
} from '@/utils/quizDocumentImport';

export interface BankImportRow {
  bank: CartridgeBank;
  /** Folders under the library root, the collection folder first. */
  path: string[];
  questionCount: number;
  /** Questions carrying a note the teacher should check. */
  flaggedCount: number;
  /** The export held no questions for this bank. */
  empty: boolean;
  /** An item with this title already sits in the same folder. */
  duplicate: boolean;
}

/** Why an empty bank was left out; Schoology drops these question types. */
export const EMPTY_BANK_REASON =
  'No questions in the export. Schoology can’t export Matching, Ordering, or multi-blank questions, so rebuild them in SpartBoard.';

/** Why an empty quiz was left out. */
export const EMPTY_QUIZ_REASON =
  'No questions in the export. Schoology can’t export Matching, Ordering, or multi-blank questions, so rebuild this quiz in SpartBoard.';

/** The library fields a duplicate check needs; banks and quizzes both carry them. */
export interface LibraryItemPlacement {
  title: string;
  folderId?: string | null;
}

const norm = (name: string): string => name.trim().toLowerCase();

const pathKey = (names: readonly string[]): string =>
  names.map(norm).join('\u0000');

/** Folder names from the library root down to `folderId`; empty at the root. */
export function folderNames(
  folderId: string | null | undefined,
  folders: readonly LibraryFolder[]
): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names: string[] = [];
  const seen = new Set<string>();
  for (
    let f = folderId ? byId.get(folderId) : undefined;
    f && !seen.has(f.id);
    f = f.parentId ? byId.get(f.parentId) : undefined
  ) {
    seen.add(f.id);
    names.unshift(f.name);
  }
  return names;
}

export function planBankImport(
  banks: readonly CartridgeBank[],
  collectionName: string,
  existing: readonly LibraryItemPlacement[],
  folders: readonly LibraryFolder[]
): BankImportRow[] {
  const taken = new Set(
    existing.map((meta) =>
      pathKey([...folderNames(meta.folderId, folders), meta.title])
    )
  );
  const root = collectionName.trim();
  return banks.map((bank) => {
    const path = [root, ...bank.folderPath].filter((n) => n.trim());
    return {
      bank,
      path,
      questionCount: bank.questions.length,
      flaggedCount: bank.questions.filter(
        (q) => q.warnings.length > 0 || questionNeedsKey(q)
      ).length,
      empty: bank.questions.length === 0,
      duplicate: taken.has(pathKey([...path, bank.title])),
    };
  });
}

/** Rows ticked when the checklist opens: not empty and not already imported. */
export const initiallyChecked = (rows: readonly BankImportRow[]): Set<string> =>
  new Set(rows.filter((r) => !r.empty && !r.duplicate).map((r) => r.bank.id));

/** Folder id for a path, reusing folders by name; call one path at a time so shared new folders aren't made twice. */
export async function ensureFolderPath(
  path: readonly string[],
  folders: readonly LibraryFolder[],
  createFolder: (name: string, parentId: string | null) => Promise<string>,
  made: Map<string, string>
): Promise<string | null> {
  let parentId: string | null = null;
  for (let depth = 0; depth < path.length; depth += 1) {
    const key = pathKey(path.slice(0, depth + 1));
    const name = path[depth];
    const known =
      made.get(key) ??
      folders.find(
        (f) => f.parentId === parentId && norm(f.name) === norm(name)
      )?.id;
    if (known) {
      parentId = known;
      continue;
    }
    const id = await createFolder(name.trim(), parentId);
    made.set(key, id);
    parentId = id;
  }
  return parentId;
}

/** Runs `task` over `items` a few at a time, reporting each finish. */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await task(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, worker)
  );
}
