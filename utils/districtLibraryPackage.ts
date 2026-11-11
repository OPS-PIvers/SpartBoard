// District library Package file contract (docs/plans/QUIZ_MCA_PRACTICE.md M31): no imports, so Node scripts can load it.

/** `format` value of `package.json`. */
export const DISTRICT_PACKAGE_FORMAT = 'spartboard-package';
/** Bump only for a breaking change; the uploader refuses newer versions. */
export const DISTRICT_PACKAGE_VERSION = 1;
/** Zip entry holding the manifest. */
export const DISTRICT_PACKAGE_MANIFEST_PATH = 'package.json';
/** Pictures live under this zip folder and are referenced by that exact path. */
export const DISTRICT_PACKAGE_PICTURES_DIR = 'pictures/';

export const DISTRICT_PACKAGE_LIMITS = {
  entries: 500,
  questionsPerEntry: 500,
  stimuliPerEntry: 300,
  picturesPerEntry: 300,
  pictureBytes: 10 * 1024 * 1024,
  titleLength: 200,
  /** One entry file, so its canonical fits in a Firestore doc. */
  entryBytes: 900_000,
  /** The whole zip, and the unzipped JSON the reader parses. */
  zipBytes: 200 * 1024 * 1024,
  jsonBytes: 20 * 1024 * 1024,
} as const;

/** Question types the Quiz widget saves; mirrors `QuizQuestionType` in types.ts. */
export const DISTRICT_PACKAGE_QUESTION_TYPES: readonly string[] = [
  'MC',
  'FIB',
  'Matching',
  'Ordering',
  'MA',
  'free-response',
];

/** Picture extensions the uploader accepts, with their content types. */
export const DISTRICT_PACKAGE_PICTURE_TYPES: Readonly<Record<string, string>> =
  {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };

/** Stable ids are letters, digits, dot, dash, colon and underscore (no slash). */
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** A saved quiz question; only id, type and text are checked and every other field passes through. */
export interface DistrictPackageQuestion {
  id: string;
  type: string;
  text: string;
  correctAnswer?: string;
  incorrectAnswers?: string[];
  stimulusIds?: string[];
  blankType?: string;
  blankChoices?: unknown;
  wordBank?: unknown;
  wordBankReuse?: boolean;
  explanation?: string;
  optionExplanations?: unknown;
  dok?: number;
  [field: string]: unknown;
}

/** A saved quiz stimulus; `url` may be a `pictures/...` path inside the zip. */
export interface DistrictPackageStimulus {
  id: string;
  type: string;
  url: string;
  label?: string;
  tabLabel?: string;
  [field: string]: unknown;
}

/** `banks/<name>.bank.json`: a `QuestionBankData` as the Quiz widget saves it. */
export interface DistrictPackageBankFile {
  id: string;
  title: string;
  questions: DistrictPackageQuestion[];
  stimuli?: DistrictPackageStimulus[];
  [field: string]: unknown;
}

/** A random draw in a packaged quiz; `bankId` is a `questionBank` entry id in the same package. */
export interface DistrictPackageBankSlot {
  id: string;
  bankId: string;
  mode: 'random';
  count: number;
  [field: string]: unknown;
}

/** `quizzes/<name>.quiz.json`: a `QuizData` as the Quiz widget saves it. */
export interface DistrictPackageQuizFile {
  id: string;
  title: string;
  questions: DistrictPackageQuestion[];
  stimuli?: DistrictPackageStimulus[];
  bankSlots?: DistrictPackageBankSlot[];
  [field: string]: unknown;
}

/** Per-question extras teachers see beside the question, never students. */
export interface DistrictPackageQuestionNote {
  id: string;
  attribution?: string;
  /** A `pictures/...` path, e.g. the statewide results chart. */
  resultsPicture?: string | null;
}

export type DistrictPackageEntryKind = 'questionBank' | 'quiz';

export interface DistrictPackageEntry {
  kind: DistrictPackageEntryKind;
  /** Stable across releases; a newer package updates the library item with the same id. */
  id: string;
  title: string;
  /** Zip path of the entry's bank or quiz JSON. */
  path: string;
  questionCount: number;
  /** Every `pictures/...` path the entry file and its notes use. */
  pictures: string[];
  questions?: DistrictPackageQuestionNote[];
  description?: string;
  tags?: string[];
}

/** `package.json` at the root of the zip. */
export interface DistrictPackageManifest {
  format: typeof DISTRICT_PACKAGE_FORMAT;
  version: number;
  title: string;
  /** Epoch ms the package was written. */
  generatedAt: number;
  /** Where the content came from, shown to admins. */
  source?: { name?: string; url?: string; [field: string]: unknown };
  entries: DistrictPackageEntry[];
}

export type DistrictPackageEntryFile =
  DistrictPackageBankFile | DistrictPackageQuizFile;

/** A package after reading: the manifest plus each entry's parsed JSON, keyed by entry id. */
export interface DistrictPackageContents {
  manifest: DistrictPackageManifest;
  files: Record<string, DistrictPackageEntryFile>;
}

export type DistrictPackageValidation =
  | { ok: true; contents: DistrictPackageContents; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonEmptyStr = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isStrList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** True for a string that looks like a zip picture path. */
export function looksLikePicturePath(value: unknown): value is string {
  return (
    typeof value === 'string' && value.startsWith(DISTRICT_PACKAGE_PICTURES_DIR)
  );
}

/** A safe zip path: under `pictures/`, no `..`, no backslashes, no doubled slash. */
export function isSafePicturePath(path: string): boolean {
  return (
    path.startsWith(DISTRICT_PACKAGE_PICTURES_DIR) &&
    path.length > DISTRICT_PACKAGE_PICTURES_DIR.length &&
    !path.includes('..') &&
    !path.includes('\\') &&
    !path.includes('//')
  );
}

/** Content type for a picture path, or null when the extension is not allowed. */
export function packagePictureContentType(path: string): string | null {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return null;
  return (
    DISTRICT_PACKAGE_PICTURE_TYPES[path.slice(dot + 1).toLowerCase()] ?? null
  );
}

/** A picture path inside text, such as `<img src="pictures/x.png">`, after a quote, `=`, `(` or space. */
const EMBEDDED_PICTURE = /(^|["'(=\s])(pictures\/[^\s"'<>()]+)/g;

/** Picture paths written inside a longer string. */
export function embeddedPicturePaths(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(EMBEDDED_PICTURE)) out.push(m[2]);
  return out;
}

/** Every picture path under `value`, whole strings and ones inside text, deduplicated. */
export function collectPicturePaths(value: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (looksLikePicturePath(v)) out.add(v);
    else if (typeof v === 'string')
      embeddedPicturePaths(v).forEach((p) => out.add(p));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isRec(v)) Object.values(v).forEach(walk);
  };
  walk(value);
  return [...out];
}

/** Deep copy of `value` with every picture path that is a key of `urls`, whole or inside text, swapped for its value. */
export function replacePicturePaths<T>(
  value: T,
  urls: ReadonlyMap<string, string>
): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const whole = urls.get(v);
      if (whole !== undefined) return whole;
      return v.replace(
        EMBEDDED_PICTURE,
        (match: string, lead: string, path: string) => {
          const url = urls.get(path);
          return url === undefined ? match : `${lead}${url}`;
        }
      );
    }
    if (Array.isArray(v)) return v.map(walk);
    if (isRec(v)) {
      const next: Rec = {};
      for (const [k, child] of Object.entries(v)) next[k] = walk(child);
      return next;
    }
    return v;
  };
  return walk(value) as T;
}

function checkStimuli(
  stimuli: unknown,
  path: string,
  errors: string[]
): Set<string> {
  const ids = new Set<string>();
  if (stimuli === undefined) return ids;
  if (!Array.isArray(stimuli)) {
    errors.push(`${path}: stimuli must be a list.`);
    return ids;
  }
  if (stimuli.length > DISTRICT_PACKAGE_LIMITS.stimuliPerEntry) {
    errors.push(
      `${path}: ${stimuli.length} stimuli; the limit is ${DISTRICT_PACKAGE_LIMITS.stimuliPerEntry}.`
    );
  }
  stimuli.forEach((s, i) => {
    const sPath = `${path}: stimuli[${i}]`;
    if (!isRec(s)) {
      errors.push(`${sPath} must be an object.`);
      return;
    }
    if (!isNonEmptyStr(s.id)) errors.push(`${sPath} has no id.`);
    else if (ids.has(s.id)) errors.push(`${sPath} repeats id "${s.id}".`);
    else ids.add(s.id);
    if (!isNonEmptyStr(s.type)) errors.push(`${sPath} has no type.`);
    if (typeof s.url !== 'string') errors.push(`${sPath} has no url.`);
  });
  return ids;
}

/** Joins blanks in a multi-blank key; mirrors FIB_BLANK_SEP in utils/quizFibBlanks.ts. */
const FIB_BLANK_SEP = '\u001F';
/** Two or more underscores write a blank in a FIB stem; mirrors utils/quizFibBlanks.ts. */
const FIB_BLANK_RE = /_{2,}/g;

/** Whether a key can actually be graded: blanks line up with the text, and choice keys agree with the options. */
function checkKeyShape(q: Rec, qPath: string, errors: string[]): void {
  const key = typeof q.correctAnswer === 'string' ? q.correctAnswer : '';
  const wrong = isStrList(q.incorrectAnswers) ? q.incorrectAnswers : [];
  if (q.type === 'FIB') {
    const blanks = key.split(FIB_BLANK_SEP);
    const inText =
      typeof q.text === 'string'
        ? (q.text.match(FIB_BLANK_RE)?.length ?? 0)
        : 0;
    // A one-part key is fine for a stem that marks its blank another way, but not for two or more written blanks.
    if (blanks.length > 1 ? blanks.length !== inText : inText > 1) {
      errors.push(
        `${qPath}: the key has ${blanks.length} ${blanks.length === 1 ? 'blank' : 'blanks'} but the text has ${inText}.`
      );
    }
    if (blanks.some((b) => b.trim() === '')) {
      errors.push(`${qPath}: a blank in the key is empty.`);
    }
    if (q.blankType === 'dropdown') {
      const choices = Array.isArray(q.blankChoices) ? q.blankChoices : [];
      blanks.forEach((answer, i) => {
        const list: unknown = isRec(choices[i])
          ? choices[i].choices
          : undefined;
        const ok =
          isStrList(list) && list.some((c) => c.trim() === answer.trim());
        if (!ok) {
          errors.push(
            `${qPath}: blank ${i + 1}'s answer is not one of its dropdown choices.`
          );
        }
      });
    }
    if (q.blankType === 'drag') {
      const bank = isStrList(q.wordBank) ? q.wordBank.map((w) => w.trim()) : [];
      blanks.forEach((answer, i) => {
        if (!bank.includes(answer.trim())) {
          errors.push(
            `${qPath}: blank ${i + 1}'s answer is not in the word bank.`
          );
        }
      });
    }
  }
  if (q.type === 'MA') {
    // A choose-all question's options are its key parts followed by its wrong answers.
    const parts = key.split('|').map((p) => p.trim());
    if (parts.some((p) => p === ''))
      errors.push(`${qPath}: the key has an empty choice.`);
    if (new Set(parts).size !== parts.length) {
      errors.push(`${qPath}: the key names the same choice twice.`);
    }
    const both = parts.filter((p) => wrong.some((w) => w.trim() === p));
    if (both.length > 0) {
      errors.push(`${qPath}: "${both[0]}" is both a right and a wrong choice.`);
    }
    const order = q.optionOrder;
    if (order !== undefined) {
      const n = parts.length + wrong.length;
      const ok =
        Array.isArray(order) &&
        order.length === n &&
        [...(order as unknown[])]
          .map(Number)
          .sort((a, b) => a - b)
          .every((v, i) => v === i);
      if (!ok)
        errors.push(`${qPath}: optionOrder doesn't match its ${n} choices.`);
    }
  }
  if (q.type === 'MC' && wrong.some((w) => w.trim() === key.trim())) {
    errors.push(`${qPath}: the answer is also listed as a wrong choice.`);
  }
}

function checkQuestions(
  questions: unknown,
  stimulusIds: ReadonlySet<string>,
  path: string,
  errors: string[]
): Set<string> {
  const seen = new Set<string>();
  if (!Array.isArray(questions)) {
    errors.push(`${path}: questions must be a list.`);
    return seen;
  }
  if (questions.length > DISTRICT_PACKAGE_LIMITS.questionsPerEntry) {
    errors.push(
      `${path}: ${questions.length} questions; the limit is ${DISTRICT_PACKAGE_LIMITS.questionsPerEntry}.`
    );
  }
  questions.forEach((q, i) => {
    const qPath = `${path}: questions[${i}]`;
    if (!isRec(q)) {
      errors.push(`${qPath} must be an object.`);
      return;
    }
    if (!isNonEmptyStr(q.id)) errors.push(`${qPath} has no id.`);
    else if (seen.has(q.id)) errors.push(`${qPath} repeats id "${q.id}".`);
    else seen.add(q.id);
    if (!isNonEmptyStr(q.type)) errors.push(`${qPath} has no type.`);
    else if (!DISTRICT_PACKAGE_QUESTION_TYPES.includes(q.type)) {
      errors.push(`${qPath}: type "${q.type}" is not a quiz question type.`);
    }
    if (typeof q.text !== 'string') errors.push(`${qPath} has no text.`);
    if (q.correctAnswer !== undefined && typeof q.correctAnswer !== 'string') {
      errors.push(`${qPath}: correctAnswer must be text.`);
    }
    // Library items are read-only for teachers, so every graded question needs its key now.
    if (q.needsKey === true) {
      errors.push(`${qPath} is marked as needing an answer key.`);
    } else if (
      q.type !== 'free-response' &&
      (typeof q.correctAnswer !== 'string' || q.correctAnswer.trim() === '')
    ) {
      errors.push(`${qPath} has no answer key.`);
    } else {
      checkKeyShape(q, qPath, errors);
    }
    if (q.incorrectAnswers !== undefined && !isStrList(q.incorrectAnswers)) {
      errors.push(`${qPath}: incorrectAnswers must be a list of text.`);
    }
    if (q.stimulusIds !== undefined) {
      if (!isStrList(q.stimulusIds)) {
        errors.push(`${qPath}: stimulusIds must be a list of text.`);
      } else {
        for (const sid of q.stimulusIds) {
          if (!stimulusIds.has(sid)) {
            errors.push(
              `${qPath} points at stimulus "${sid}", which the file does not have.`
            );
          }
        }
      }
    }
  });
  return seen;
}

/** `order` must name each question and draw once, and `sections` must match the order's section entries. */
function checkLayout(
  raw: Rec,
  questionIds: ReadonlySet<string>,
  slotIds: ReadonlySet<string>,
  path: string,
  errors: string[]
): void {
  const sectionIds = new Set<string>();
  if (raw.sections !== undefined) {
    if (!Array.isArray(raw.sections)) {
      errors.push(`${path}: sections must be a list.`);
    } else {
      raw.sections.forEach((sec, i) => {
        if (!isRec(sec) || !isNonEmptyStr(sec.id)) {
          errors.push(`${path}: sections[${i}] has no id.`);
        } else if (sectionIds.has(sec.id)) {
          errors.push(`${path}: sections[${i}] repeats id "${sec.id}".`);
        } else {
          sectionIds.add(sec.id);
        }
      });
    }
  }
  if (raw.order === undefined) {
    if (sectionIds.size > 0) errors.push(`${path} has sections but no order.`);
    return;
  }
  if (!Array.isArray(raw.order)) {
    errors.push(`${path}: order must be a list.`);
    return;
  }
  const seen = new Set<string>();
  raw.order.forEach((o, i) => {
    const oPath = `${path}: order[${i}]`;
    if (!isRec(o) || !isNonEmptyStr(o.id)) {
      errors.push(`${oPath} has no id.`);
      return;
    }
    const key = `${String(o.kind)}:${o.id}`;
    if (seen.has(key)) errors.push(`${oPath} lists "${o.id}" twice.`);
    seen.add(key);
    const known =
      o.kind === 'question'
        ? questionIds
        : o.kind === 'slot'
          ? slotIds
          : o.kind === 'section'
            ? sectionIds
            : null;
    if (!known)
      errors.push(`${oPath}: kind must be "question", "slot" or "section".`);
    else if (!known.has(o.id))
      errors.push(
        `${oPath} points at "${o.id}", which the file does not have.`
      );
  });
  for (const id of questionIds) {
    if (!seen.has(`question:${id}`))
      errors.push(`${path}: order leaves out question "${id}".`);
  }
  for (const id of slotIds) {
    if (!seen.has(`slot:${id}`))
      errors.push(`${path}: order leaves out draw "${id}".`);
  }
  for (const id of sectionIds) {
    if (!seen.has(`section:${id}`))
      errors.push(`${path}: order leaves out section "${id}".`);
  }
}

/** Checks `package.json`; `zipPaths` is every file in the zip. */
export function validateDistrictPackageManifest(
  raw: unknown,
  zipPaths: readonly string[]
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRec(raw)) {
    return { errors: ['package.json is not an object.'], warnings };
  }
  if (raw.format !== DISTRICT_PACKAGE_FORMAT) {
    errors.push(
      `This is not a SpartBoard package file (format "${String(raw.format)}").`
    );
  }
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    errors.push('package.json has no version.');
  } else if (version > DISTRICT_PACKAGE_VERSION) {
    errors.push(
      `The package is version ${version}; this SpartBoard reads up to version ${DISTRICT_PACKAGE_VERSION}.`
    );
  }
  if (!isNonEmptyStr(raw.title)) errors.push('package.json has no title.');
  if (typeof raw.generatedAt !== 'number') {
    errors.push('package.json has no generatedAt time.');
  }
  if (raw.source !== undefined && !isRec(raw.source)) {
    errors.push('package.json source must be an object.');
  }
  const entries = raw.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push('The package has no entries.');
    return { errors, warnings };
  }
  if (entries.length > DISTRICT_PACKAGE_LIMITS.entries) {
    errors.push(
      `The package has ${entries.length} entries; the limit is ${DISTRICT_PACKAGE_LIMITS.entries}.`
    );
  }
  const zip = new Set(zipPaths);
  const ids = new Set<string>();
  const paths = new Set<string>();
  entries.forEach((entry, i) => {
    const ePath = `entries[${i}]`;
    if (!isRec(entry)) {
      errors.push(`${ePath} must be an object.`);
      return;
    }
    if (!isNonEmptyStr(entry.id) || !STABLE_ID.test(entry.id)) {
      errors.push(
        `${ePath} needs an id of letters, digits, dots, dashes, colons or underscores.`
      );
    } else if (ids.has(entry.id)) {
      errors.push(`${ePath} repeats id "${entry.id}".`);
    } else {
      ids.add(entry.id);
    }
    if (entry.kind !== 'questionBank' && entry.kind !== 'quiz') {
      errors.push(`${ePath}: kind must be "questionBank" or "quiz".`);
    }
    if (!isNonEmptyStr(entry.title)) errors.push(`${ePath} has no title.`);
    else if (entry.title.length > DISTRICT_PACKAGE_LIMITS.titleLength) {
      errors.push(
        `${ePath}: title is longer than ${DISTRICT_PACKAGE_LIMITS.titleLength} characters.`
      );
    }
    if (!isNonEmptyStr(entry.path)) {
      errors.push(`${ePath} has no path.`);
    } else if (!zip.has(entry.path)) {
      errors.push(`${ePath}: "${entry.path}" is not in the package.`);
    } else if (paths.has(entry.path)) {
      errors.push(`${ePath}: "${entry.path}" is used by two entries.`);
    } else {
      paths.add(entry.path);
    }
    if (typeof entry.questionCount !== 'number') {
      errors.push(`${ePath} has no questionCount.`);
    }
    if (
      entry.description !== undefined &&
      typeof entry.description !== 'string'
    ) {
      errors.push(`${ePath}: description must be text.`);
    }
    if (entry.tags !== undefined && !isStrList(entry.tags)) {
      errors.push(`${ePath}: tags must be a list of text.`);
    }
    if (!isStrList(entry.pictures)) {
      errors.push(`${ePath}: pictures must be a list of paths.`);
    } else {
      if (entry.pictures.length > DISTRICT_PACKAGE_LIMITS.picturesPerEntry) {
        errors.push(
          `${ePath} has more than ${DISTRICT_PACKAGE_LIMITS.picturesPerEntry} pictures.`
        );
      }
      for (const pic of entry.pictures) {
        if (!isSafePicturePath(pic)) {
          errors.push(
            `${ePath}: picture "${pic}" must sit under ${DISTRICT_PACKAGE_PICTURES_DIR}.`
          );
        } else if (packagePictureContentType(pic) === null) {
          errors.push(
            `${ePath}: picture "${pic}" is not a PNG, JPEG, GIF or WebP file.`
          );
        } else if (!zip.has(pic)) {
          errors.push(`${ePath}: picture "${pic}" is not in the package.`);
        }
      }
    }
    if (entry.questions !== undefined) {
      if (!Array.isArray(entry.questions)) {
        errors.push(`${ePath}: questions must be a list.`);
      } else {
        const declared = new Set(
          isStrList(entry.pictures) ? entry.pictures : []
        );
        entry.questions.forEach((note, j) => {
          const nPath = `${ePath}: questions[${j}]`;
          if (!isRec(note) || !isNonEmptyStr(note.id)) {
            errors.push(`${nPath} has no id.`);
            return;
          }
          if (
            note.attribution !== undefined &&
            typeof note.attribution !== 'string'
          ) {
            errors.push(`${nPath}: attribution must be text.`);
          }
          const rp = note.resultsPicture;
          if (
            rp !== undefined &&
            rp !== null &&
            (typeof rp !== 'string' || !declared.has(rp))
          ) {
            errors.push(
              `${nPath}: resultsPicture must be one of the entry's pictures.`
            );
          }
        });
      }
    }
  });
  return { errors, warnings };
}

/** Checks one entry's parsed JSON against its manifest entry. */
export function validateDistrictPackageEntryFile(
  entry: DistrictPackageEntry,
  raw: unknown,
  bankEntryIds: ReadonlySet<string>,
  /** Question count of each bank file in the package, for draw sizes. */
  bankSizes: ReadonlyMap<string, number> = new Map()
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const path = entry.path;
  if (!isRec(raw)) {
    return { errors: [`${path} is not an object.`], warnings };
  }
  if (raw.id !== entry.id) {
    errors.push(
      `${path}: id "${String(raw.id)}" does not match its entry "${entry.id}".`
    );
  }
  const bytes = new TextEncoder().encode(JSON.stringify(raw)).length;
  if (bytes > DISTRICT_PACKAGE_LIMITS.entryBytes) {
    errors.push(
      `${path} is too large for one library item; split it into smaller banks.`
    );
  }
  if (!isNonEmptyStr(raw.title)) errors.push(`${path} has no title.`);
  const stimulusIds = checkStimuli(raw.stimuli, path, errors);
  const questionIds = checkQuestions(raw.questions, stimulusIds, path, errors);
  if (
    Array.isArray(raw.questions) &&
    raw.questions.length !== entry.questionCount
  ) {
    warnings.push(
      `${path}: package.json says ${entry.questionCount} questions; the file has ${raw.questions.length}.`
    );
  }
  if (Array.isArray(raw.questions) && raw.questions.length === 0) {
    warnings.push(`"${entry.title}" has no questions.`);
  }
  if (entry.kind === 'questionBank' && raw.bankSlots !== undefined) {
    errors.push(`${path} is a question bank and cannot draw from other banks.`);
  }
  const slotIds = new Set<string>();
  if (entry.kind === 'quiz' && raw.bankSlots !== undefined) {
    if (!Array.isArray(raw.bankSlots)) {
      errors.push(`${path}: bankSlots must be a list.`);
    } else {
      raw.bankSlots.forEach((slot, j) => {
        const sPath = `${path}: bankSlots[${j}]`;
        if (!isRec(slot) || !isNonEmptyStr(slot.id)) {
          errors.push(`${sPath} has no id.`);
          return;
        }
        if (slotIds.has(slot.id) || questionIds.has(slot.id)) {
          errors.push(`${sPath} repeats id "${slot.id}".`);
        }
        slotIds.add(slot.id);
        if (!isNonEmptyStr(slot.bankId) || !bankEntryIds.has(slot.bankId)) {
          errors.push(
            `${sPath} draws from "${String(slot.bankId)}", which is not a question bank in this package.`
          );
        }
        if (slot.mode !== 'random')
          errors.push(`${sPath}: mode must be "random".`);
        if (
          typeof slot.count !== 'number' ||
          !Number.isInteger(slot.count) ||
          slot.count < 1
        ) {
          errors.push(`${sPath}: count must be a whole number of at least 1.`);
        } else if (isNonEmptyStr(slot.bankId)) {
          const size = bankSizes.get(slot.bankId);
          if (size !== undefined && slot.count > size) {
            errors.push(
              `${sPath} draws ${slot.count} questions from a bank of ${size}.`
            );
          }
        }
      });
    }
  }
  checkLayout(raw, questionIds, slotIds, path, errors);
  const declared = new Set(entry.pictures);
  for (const pic of collectPicturePaths(raw)) {
    if (!declared.has(pic)) {
      errors.push(
        `${path} uses picture "${pic}", which its entry does not list.`
      );
    }
  }
  for (const note of entry.questions ?? []) {
    if (!questionIds.has(note.id)) {
      warnings.push(
        `${path}: package.json has notes for question "${note.id}", which the file does not have.`
      );
    }
  }
  return { errors, warnings };
}

/** Checks a whole package; `files` maps each zip path to its parsed JSON (only the entry paths are read). */
export function validateDistrictPackage(
  manifestRaw: unknown,
  zipPaths: readonly string[],
  files: Readonly<Record<string, unknown>>
): DistrictPackageValidation {
  const head = validateDistrictPackageManifest(manifestRaw, zipPaths);
  const errors = [...head.errors];
  const warnings = [...head.warnings];
  if (errors.length > 0) return { ok: false, errors, warnings };
  const manifest = manifestRaw as DistrictPackageManifest;
  const bankIds = new Set(
    manifest.entries.filter((e) => e.kind === 'questionBank').map((e) => e.id)
  );
  const bankSizes = new Map<string, number>();
  for (const e of manifest.entries) {
    const raw = files[e.path];
    if (
      e.kind === 'questionBank' &&
      isRec(raw) &&
      Array.isArray(raw.questions)
    ) {
      bankSizes.set(e.id, raw.questions.length);
    }
  }
  const parsed: Record<string, DistrictPackageEntryFile> = {};
  for (const entry of manifest.entries) {
    const raw = files[entry.path];
    if (raw === undefined) {
      errors.push(`${entry.path} could not be read as JSON.`);
      continue;
    }
    const result = validateDistrictPackageEntryFile(
      entry,
      raw,
      bankIds,
      bankSizes
    );
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    parsed[entry.id] = raw as DistrictPackageEntryFile;
  }
  const used = new Set(manifest.entries.flatMap((e) => e.pictures));
  const unused = zipPaths.filter(
    (p) =>
      p.startsWith(DISTRICT_PACKAGE_PICTURES_DIR) &&
      !p.endsWith('/') &&
      !used.has(p)
  );
  if (unused.length > 0) {
    warnings.push(
      `${unused.length} picture${unused.length === 1 ? ' is' : 's are'} in the package but not used.`
    );
  }
  if (errors.length > 0) return { ok: false, errors, warnings };
  return { ok: true, contents: { manifest, files: parsed }, warnings };
}
