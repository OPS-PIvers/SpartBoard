// Turns Package file entries into library content (docs/plans/QUIZ_MCA_PRACTICE.md M29, M31).
import type {
  QuestionBankData,
  QuestionTargetTag,
  QuizBankSlot,
  QuizBehaviorSettings,
  QuizData,
  QuizOrderEntry,
  QuizQuestion,
  QuizSection,
  QuizStimulus,
  QuizTranslation,
  SyncedQuizGroup,
} from '@/types';
import type {
  DistrictLibraryItem,
  DistrictLibraryKind,
  DistrictLibraryQuestionNote,
} from '@/types/districtLibrary';
import {
  DISTRICT_PACKAGE_PICTURES_DIR,
  replacePicturePaths,
  type DistrictPackageBankFile,
  type DistrictPackageEntry,
  type DistrictPackageManifest,
  type DistrictPackageQuestion,
  type DistrictPackageQuizFile,
} from '@/utils/districtLibraryPackage';
import { normalizeQuizQuestions } from '@/utils/quizQuestionNormalize';
import { stripUndefined } from '@/utils/questionBankRecords';

export const DISTRICT_LIBRARY_COLLECTION = 'district_library';
export const DISTRICT_LIBRARY_INDEX_COLLECTION = 'district_library_index';
export const DISTRICT_LIBRARY_INDEX_DOC = 'published';
export const DISTRICT_LINKS_SUBCOLLECTION = 'district_links';

export const libraryKindFor = (
  entry: DistrictPackageEntry
): DistrictLibraryKind => (entry.kind === 'quiz' ? 'quiz' : 'bank');

/** One picture folder per upload attempt, so a retry never overwrites pictures a live session already loads. */
export const pictureFolderFor = (version: number, attemptId: string): string =>
  `v${version}-${attemptId}`;

/** Storage path for one picture inside an attempt's folder. */
export function pictureStoragePath(
  itemId: string,
  folder: string,
  picturePath: string
): string {
  const name = picturePath.startsWith(DISTRICT_PACKAGE_PICTURES_DIR)
    ? picturePath.slice(DISTRICT_PACKAGE_PICTURES_DIR.length)
    : picturePath;
  return `district_library/${itemId}/${folder}/${name}`;
}

/** Firestore refuses arrays inside arrays; find one before any write. */
export function hasNestedArray(value: unknown, inArray = false): boolean {
  if (Array.isArray(value)) {
    if (inArray) return true;
    return value.some((v) => hasNestedArray(v, true));
  }
  if (isRecord(value)) {
    return Object.values(value).some((v) => hasNestedArray(v, false));
  }
  return false;
}

/** A Firestore doc holds at most 1 MiB; leave room for field names and the header. */
export const CANONICAL_BYTE_LIMIT = 900_000;

export const approxDocBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).length;

/** Question ids a replace removes and adds. */
export function diffQuestionIds(
  before: readonly string[],
  after: readonly string[]
): { removed: string[]; added: string[] } {
  const a = new Set(after);
  const b = new Set(before);
  return {
    removed: before.filter((id) => !a.has(id)),
    added: after.filter((id) => !b.has(id)),
  };
}

/** Drops removed questions from each locale; a locale left with nothing is dropped too. */
export function pruneTranslations(
  translations: Record<string, QuizTranslation> | undefined,
  removed: readonly string[]
): Record<string, QuizTranslation> | undefined {
  if (!translations || removed.length === 0) return translations;
  const gone = new Set(removed);
  const out: Record<string, QuizTranslation> = {};
  for (const [locale, t] of Object.entries(translations)) {
    const keep = <V>(rec: Record<string, V>) =>
      Object.fromEntries(Object.entries(rec).filter(([id]) => !gone.has(id)));
    const questions = keep(t.questions ?? {});
    if (Object.keys(questions).length === 0) continue;
    out[locale] = {
      ...t,
      questions,
      sourceHashes: keep(t.sourceHashes ?? {}),
      reviewedQuestionIds: (t.reviewedQuestionIds ?? []).filter(
        (id) => !gone.has(id)
      ),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fills the fields every saved question has, keeping everything else the package sent. */
export function asQuizQuestion(q: DistrictPackageQuestion): QuizQuestion {
  return {
    ...q,
    timeLimit: typeof q.timeLimit === 'number' ? q.timeLimit : 0,
    correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : '',
    incorrectAnswers: Array.isArray(q.incorrectAnswers)
      ? q.incorrectAnswers
      : [],
  } as unknown as QuizQuestion;
}

function asStimuli(list: unknown): QuizStimulus[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list.map((s) => {
    const rec = s as Record<string, unknown>;
    return {
      ...rec,
      label: typeof rec.label === 'string' ? rec.label : '',
    } as unknown as QuizStimulus;
  });
}

/** Library questions carry their item id so every copy, merge and share check can trace them (M30). */
export const markQuestions = (
  questions: QuizQuestion[],
  itemId: string
): QuizQuestion[] => questions.map((q) => ({ ...q, districtItemId: itemId }));

const listOrUndefined = <T>(v: unknown): T[] | undefined =>
  Array.isArray(v) && v.length > 0 ? (v as T[]) : undefined;

/** A package bank as a `QuestionBankData` with its pictures pointing at uploaded URLs. */
export function bankFromPackage(
  file: DistrictPackageBankFile,
  urls: ReadonlyMap<string, string>,
  now: number
): QuestionBankData {
  const resolved = replacePicturePaths(file, urls);
  const bank: QuestionBankData = {
    id: resolved.id,
    title: resolved.title,
    questions: markQuestions(
      normalizeQuizQuestions(resolved.questions.map(asQuizQuestion)),
      resolved.id
    ),
    stimuli: asStimuli(resolved.stimuli),
    targets: listOrUndefined<QuestionTargetTag>(resolved.targets),
    language:
      typeof resolved.language === 'string' ? resolved.language : undefined,
    createdAt:
      typeof resolved.createdAt === 'number' ? resolved.createdAt : now,
    updatedAt: now,
  };
  return stripUndefined(bank);
}

export interface LibraryBankRef {
  itemId: string;
  syncGroupId: string;
  ownerUid: string;
  title: string;
}

/** A package quiz as `QuizData`; its random slots draw from the library banks in `banks` (by entry id). */
export function quizFromPackage(
  file: DistrictPackageQuizFile,
  urls: ReadonlyMap<string, string>,
  banks: ReadonlyMap<string, LibraryBankRef>,
  now: number
): QuizData {
  const resolved = replacePicturePaths(file, urls);
  const bankSlots = (resolved.bankSlots ?? []).map((slot): QuizBankSlot => {
    const bank = banks.get(slot.bankId);
    if (!bank) {
      throw new Error(
        `"${resolved.title}" draws from a bank that was not published.`
      );
    }
    return {
      ...(slot as unknown as QuizBankSlot),
      id: slot.id,
      bankId: bank.itemId,
      syncGroupId: bank.syncGroupId,
      syncOwnerUid: bank.ownerUid,
      bankTitle: bank.title,
      mode: 'random',
      count: slot.count,
      districtItemId: bank.itemId,
    };
  });
  const quiz: QuizData = {
    id: resolved.id,
    title: resolved.title,
    questions: markQuestions(
      normalizeQuizQuestions(resolved.questions.map(asQuizQuestion)),
      resolved.id
    ),
    stimuli: asStimuli(resolved.stimuli),
    language:
      typeof resolved.language === 'string' ? resolved.language : undefined,
    bankSlots: bankSlots.length > 0 ? bankSlots : undefined,
    order: listOrUndefined<QuizOrderEntry>(resolved.order),
    sections: listOrUndefined<QuizSection>(resolved.sections),
    createdAt:
      typeof resolved.createdAt === 'number' ? resolved.createdAt : now,
    updatedAt: now,
  };
  return stripUndefined(quiz);
}

/** Behavior settings a packaged quiz carries, if any. */
export function behaviorFromPackage(
  file: DistrictPackageQuizFile
): QuizBehaviorSettings | undefined {
  return isRecord(file.behavior)
    ? (file.behavior as unknown as QuizBehaviorSettings)
    : undefined;
}

/** Attribution and results picture per question, keyed by question id. */
export function questionNotesFrom(
  entry: DistrictPackageEntry,
  urls: ReadonlyMap<string, string>
): Record<string, DistrictLibraryQuestionNote> | undefined {
  const out: Record<string, DistrictLibraryQuestionNote> = {};
  for (const note of entry.questions ?? []) {
    const resultsPictureUrl = note.resultsPicture
      ? urls.get(note.resultsPicture)
      : undefined;
    const raw: DistrictLibraryQuestionNote = {
      attribution: note.attribution?.trim() ? note.attribution : undefined,
      resultsPictureUrl,
    };
    const next = stripUndefined(raw);
    if (Object.keys(next).length > 0) out[note.id] = next;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Full `synced_quizzes/{groupId}` doc for a library quiz; keys match the rules allowlist. */
export function syncedQuizDocFor(
  quiz: QuizData,
  input: {
    groupId: string;
    itemId: string;
    version: number;
    uid: string;
    participants: Record<string, { joinedAt: number }>;
    createdAt: number;
    now: number;
    behavior?: QuizBehaviorSettings;
  }
): SyncedQuizGroup {
  const group: SyncedQuizGroup = {
    id: input.groupId,
    version: input.version,
    title: quiz.title,
    questions: quiz.questions,
    stimuli: quiz.stimuli?.length ? quiz.stimuli : undefined,
    language: quiz.language,
    bankSlots: quiz.bankSlots?.length ? quiz.bankSlots : undefined,
    order: quiz.order?.length ? quiz.order : undefined,
    sections: quiz.sections?.length ? quiz.sections : undefined,
    behavior: input.behavior,
    participants: input.participants,
    createdAt: input.createdAt,
    updatedAt: input.now,
    updatedBy: input.uid,
    districtItemId: input.itemId,
  };
  return stripUndefined(group);
}

/** A new item's first header: a draft nobody sees, holding the random canonical id every later upload reuses. */
export function draftHeaderFor(
  entry: DistrictPackageEntry,
  input: { syncGroupId: string; uid: string; now: number }
): DistrictLibraryItem {
  return {
    id: entry.id,
    kind: libraryKindFor(entry),
    title: entry.title,
    questionCount: 0,
    status: 'draft',
    everyone: false,
    targetBuildings: [],
    targetGrades: [],
    targetEmails: [],
    gradeBuildings: [],
    syncGroupId: input.syncGroupId,
    contentVersion: 0,
    createdAt: input.now,
    updatedAt: input.now,
    updatedBy: input.uid,
  };
}

/** Optional header fields a package owns; a newer package that drops one clears it. */
export const PACKAGE_OWNED_OPTIONAL_KEYS = [
  'description',
  'tags',
  'packageTitle',
  'packageGeneratedAt',
  'sourceName',
  'questionNotes',
] as const;

/** The header fields an upload owns; status, targeting, syncGroupId and createdAt belong to the item and are never touched. */
export function packageFieldsFor(
  entry: DistrictPackageEntry,
  manifest: DistrictPackageManifest,
  input: {
    contentVersion: number;
    questionCount: number;
    questionNotes?: Record<string, DistrictLibraryQuestionNote>;
    uid: string;
    now: number;
  }
): Partial<DistrictLibraryItem> {
  const sourceName =
    manifest.source && typeof manifest.source.name === 'string'
      ? manifest.source.name
      : undefined;
  const fields: Partial<DistrictLibraryItem> = {
    title: entry.title,
    description: entry.description,
    tags: entry.tags && entry.tags.length > 0 ? entry.tags : undefined,
    questionCount: input.questionCount,
    contentVersion: input.contentVersion,
    packageTitle: manifest.title,
    packageGeneratedAt: manifest.generatedAt,
    sourceName,
    questionNotes: input.questionNotes,
    updatedAt: input.now,
    updatedBy: input.uid,
  };
  return stripUndefined(fields);
}

/** Entries in publish order: banks first so quizzes can draw from them. */
export function publishOrder(
  entries: readonly DistrictPackageEntry[]
): DistrictPackageEntry[] {
  return [
    ...entries.filter((e) => e.kind === 'questionBank'),
    ...entries.filter((e) => e.kind === 'quiz'),
  ];
}

/** What an upload will do to each entry, for the review step. */
export function planPackageUpload(
  entries: readonly DistrictPackageEntry[],
  existing: ReadonlyMap<string, DistrictLibraryItem>
): {
  entry: DistrictPackageEntry;
  action: 'add' | 'update';
  status?: string;
}[] {
  return publishOrder(entries).map((entry) => {
    const prev = existing.get(entry.id);
    return prev && prev.contentVersion > 0
      ? { entry, action: 'update' as const, status: prev.status }
      : { entry, action: 'add' as const };
  });
}

export interface UploadProblem {
  id: string;
  title: string;
  message: string;
}

/** Everything that could fail mid-upload, checked before the first write: kind changes, missing banks, nested arrays and size. */
export function checkPackageUpload(
  manifest: DistrictPackageManifest,
  files: Readonly<
    Record<string, DistrictPackageBankFile | DistrictPackageQuizFile>
  >,
  existing: ReadonlyMap<string, DistrictLibraryItem | null>,
  onlyIds?: ReadonlySet<string>
): UploadProblem[] {
  const problems: UploadProblem[] = [];
  const entries = publishOrder(manifest.entries).filter(
    (e) => !onlyIds || onlyIds.has(e.id)
  );
  const bankIds = new Set(
    manifest.entries
      .filter(
        (e) =>
          e.kind === 'questionBank' &&
          (!onlyIds || onlyIds.has(e.id) || existing.get(e.id))
      )
      .map((e) => e.id)
  );
  const placeholder = new Map<string, string>();
  const banks = new Map<string, LibraryBankRef>(
    [...bankIds].map((id) => [
      id,
      { itemId: id, syncGroupId: 'check', ownerUid: 'check', title: id },
    ])
  );
  for (const entry of entries) {
    const fail = (message: string) =>
      problems.push({ id: entry.id, title: entry.title, message });
    const prev = existing.get(entry.id);
    if (prev && prev.kind !== libraryKindFor(entry)) {
      fail(
        `This was a ${prev.kind === 'quiz' ? 'quiz' : 'question bank'} in the library. Give the new one its own id.`
      );
      continue;
    }
    try {
      const built =
        entry.kind === 'questionBank'
          ? bankFromPackage(files[entry.id], placeholder, 0)
          : quizFromPackage(files[entry.id], placeholder, banks, 0);
      if (hasNestedArray(built)) {
        fail(
          "A question has a list inside a list, which the library can't store."
        );
      } else if (approxDocBytes(built) > CANONICAL_BYTE_LIMIT) {
        fail(
          'Too much text for one library item. Split it into smaller banks.'
        );
      }
    } catch (err) {
      fail(
        err instanceof Error ? err.message : 'This entry could not be read.'
      );
    }
  }
  return problems;
}
