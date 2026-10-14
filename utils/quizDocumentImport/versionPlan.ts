// Grouping a versioned test into a bank and generated quizzes, and building them (QUIZ_IMPORT_VERSIONS V1, V5-V10, V17).
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import type {
  QuizBehaviorSettings,
  QuestionBankData,
  QuizBankSlot,
  QuizData,
  QuizOrderEntry,
  QuizQuestion,
  QuizSection,
} from '@/types';
import { toQuizQuestion } from './toQuizData';
import type {
  ExtractedQuestion,
  ImportedTestSet,
  ImportedVersion,
  VersionGroupKind,
} from './types';

/** The AI's three kinds, plus a reordered MC copy found in the browser (V9). */
export type PlanGroupKind = VersionGroupKind | 'duplicate';

export interface PlanGroup {
  id: string;
  kind: PlanGroupKind;
  /** The generated quiz's name. */
  name: string;
  /** Indexes into `ImportedTestSet.versions`, ascending. */
  versions: number[];
  /** False when the teacher unticked this quiz. */
  create: boolean;
}

/** What the teacher confirms in review; versions in no group still go to the bank. */
export interface VersionPlan {
  groups: PlanGroup[];
  /** Image id to the earlier identical image it shares; unlinked ones are removed. */
  sharedImages: Record<string, string>;
}

const normalize = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, ' ').trim();

/** The answer as text, so a version that moved the right choice to another letter still matches. */
function answerTexts(q: ExtractedQuestion): string[] {
  return q.correctAnswer
    .split('|')
    .map((part) => {
      const a = part.trim();
      const byLetter = /^[A-Fa-f]$/.test(a)
        ? q.options.find((o) => o.letter === a.toUpperCase())
        : undefined;
      return normalize(byLetter ? byLetter.text : a);
    })
    .filter(Boolean)
    .sort();
}

/** A question's content regardless of where it sits or how its choices are lettered. */
function choiceSignature(q: ExtractedQuestion): string | null {
  if (q.type !== 'MC' && q.type !== 'MA') return null;
  return JSON.stringify([
    q.type,
    normalize(q.text),
    q.options.map((o) => normalize(o.text)).sort(),
    answerTexts(q),
  ]);
}

/** True when `b` holds exactly `a`'s choice questions, each keyed the same, in any order (V9). */
export function isReorderOf(
  a: readonly ExtractedQuestion[],
  b: readonly ExtractedQuestion[]
): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  const sa = a.map(choiceSignature);
  const sb = b.map(choiceSignature);
  if (sa.some((s) => s === null) || sb.some((s) => s === null)) return false;
  const left = (sa as string[]).sort();
  const right = (sb as string[]).sort();
  return left.every((s, i) => s === right[i]);
}

/** True when every version after the first is the first one reordered. */
export function groupIsReordered(
  set: Pick<ImportedTestSet, 'versions'>,
  versions: readonly number[]
): boolean {
  if (versions.length < 2) return false;
  const first = set.versions[versions[0]]?.questions ?? [];
  return versions
    .slice(1)
    .every((v) => isReorderOf(first, set.versions[v]?.questions ?? []));
}

/** Each later version that is an earlier one reordered, with the version it copies. */
export function findReorders(
  set: Pick<ImportedTestSet, 'versions'>
): { version: number; of: number }[] {
  const found: { version: number; of: number }[] = [];
  set.versions.forEach((v, j) => {
    for (let i = 0; i < j; i++) {
      if (found.some((f) => f.version === i)) continue;
      if (isReorderOf(set.versions[i].questions, v.questions)) {
        found.push({ version: j, of: i });
        return;
      }
    }
  });
  return found;
}

/** A retake quiz is named "… Retake" (V8). */
export function retakeName(name: string): string {
  const trimmed = name.trim();
  return /\bretake\b/i.test(trimmed) ? trimmed : `${trimmed} Retake`.trim();
}

const nextGroupId = (groups: readonly PlanGroup[]): string => {
  const used = new Set(groups.map((g) => g.id));
  let n = groups.length + 1;
  while (used.has(`g${n}`)) n++;
  return `g${n}`;
};

/** The AI's proposal, with reordered MC copies turned into one shuffled quiz (V8, V9). */
export function initialVersionPlan(set: ImportedTestSet): VersionPlan {
  const count = set.versions.length;
  const taken = new Set<number>();
  const groups: PlanGroup[] = [];
  for (const g of set.groups) {
    const members = [...new Set(g.versions)]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < count)
      .filter((i) => !taken.has(i))
      .sort((a, b) => a - b);
    if (members.length === 0) continue;
    members.forEach((i) => taken.add(i));
    const name =
      g.name.trim() || members.map((i) => set.versions[i].label).join(' / ');
    const reordered = groupIsReordered(set, members);
    groups.push({
      id: nextGroupId(groups),
      kind: reordered ? 'duplicate' : g.kind,
      name: !reordered && g.kind === 'retake' ? retakeName(name) : name,
      versions: members,
      create: true,
    });
  }
  // Reordered copies the AI left ungrouped still become one shuffled quiz.
  for (const { version, of } of findReorders(set)) {
    if (taken.has(version) || taken.has(of)) continue;
    taken.add(version);
    taken.add(of);
    groups.push({
      id: nextGroupId(groups),
      kind: 'duplicate',
      name: set.title,
      versions: [of, version],
      create: true,
    });
  }
  return { groups, sharedImages: { ...set.sharedImages } };
}

/** A duplicate group whose members stopped being reorders goes back to parallel. */
function settle(set: ImportedTestSet, groups: PlanGroup[]): PlanGroup[] {
  return groups
    .filter((g) => g.versions.length > 0)
    .map((g) =>
      g.kind === 'duplicate' && !groupIsReordered(set, g.versions)
        ? { ...g, kind: 'parallel' }
        : g
    );
}

export const NEW_GROUP = 'new';
export const NO_GROUP = 'none';

/** Moves a version to another quiz, a new one, or none (bank only). */
export function assignVersion(
  set: ImportedTestSet,
  plan: VersionPlan,
  version: number,
  target: string
): VersionPlan {
  const without = plan.groups.map((g) => ({
    ...g,
    versions: g.versions.filter((v) => v !== version),
  }));
  let groups: PlanGroup[];
  if (target === NO_GROUP) groups = without;
  else if (target === NEW_GROUP) {
    groups = [
      ...without,
      {
        id: nextGroupId(plan.groups),
        kind: 'parallel',
        name: set.versions[version]?.label ?? '',
        versions: [version],
        create: true,
      },
    ];
  } else {
    groups = without.map((g) =>
      g.id === target
        ? { ...g, versions: [...g.versions, version].sort((a, b) => a - b) }
        : g
    );
  }
  return { ...plan, groups: settle(set, groups) };
}

export function setGroupKind(
  set: ImportedTestSet,
  plan: VersionPlan,
  groupId: string,
  kind: PlanGroupKind
): VersionPlan {
  const groups = plan.groups.map((g) =>
    g.id === groupId
      ? {
          ...g,
          kind,
          name: kind === 'retake' ? retakeName(g.name) : g.name,
        }
      : g
  );
  return { ...plan, groups: settle(set, groups) };
}

export const renameGroup = (
  plan: VersionPlan,
  groupId: string,
  name: string
): VersionPlan => ({
  ...plan,
  groups: plan.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
});

export const setGroupCreate = (
  plan: VersionPlan,
  groupId: string,
  create: boolean
): VersionPlan => ({
  ...plan,
  groups: plan.groups.map((g) => (g.id === groupId ? { ...g, create } : g)),
});

/** Gives a version its own copy of a picture it was sharing (V17). */
export function unlinkImage(plan: VersionPlan, imageId: string): VersionPlan {
  const { [imageId]: _gone, ...rest } = plan.sharedImages;
  return { ...plan, sharedImages: rest };
}

export const linkImage = (
  plan: VersionPlan,
  imageId: string,
  sourceId: string
): VersionPlan => ({
  ...plan,
  sharedImages: { ...plan.sharedImages, [imageId]: sourceId },
});

/** Problems that stop the import; empty when it can go ahead. */
export function planProblems(plan: VersionPlan): string[] {
  return plan.groups.some((g) => g.create && !g.name.trim())
    ? ['Give every quiz a name.']
    : [];
}

/** A version's questions; a written version is one question with one box (V1). */
export function versionQuestions(
  version: ImportedVersion,
  sharedImages: Readonly<Record<string, string>>
): QuizQuestion[] {
  const questions = version.questions.map((q) => {
    const question = toQuizQuestion(q);
    if (!question.stimulusIds) return question;
    return {
      ...question,
      stimulusIds: [
        ...new Set(question.stimulusIds.map((id) => sharedImages[id] ?? id)),
      ],
    };
  });
  if (
    questions.length < 2 ||
    !questions.every((q) => q.type === 'free-response')
  )
    return questions;
  const points = questions.map((q) => q.points);
  const stimulusIds = [
    ...new Set(questions.flatMap((q) => q.stimulusIds ?? [])),
  ];
  return [
    {
      ...questions[0],
      text: questions.map((q) => q.text.trim()).join('\n'),
      ...(points.every((p) => p !== undefined)
        ? { points: points.reduce<number>((sum, p) => sum + (p ?? 0), 0) }
        : {}),
      ...(stimulusIds.length > 0 ? { stimulusIds } : {}),
    },
  ];
}

/** A reordered copy saves with questions and choices shuffled per student (V9). */
export const SHUFFLED_BEHAVIOR: QuizBehaviorSettings = {
  ...DEFAULT_QUIZ_BEHAVIOR,
  sessionOptions: {
    ...DEFAULT_QUIZ_BEHAVIOR.sessionOptions,
    shuffleQuestions: true,
    shuffleAnswerOptions: true,
  },
};

export interface PlannedQuiz {
  quiz: QuizData;
  /** Turn question and choice shuffling on (V9). */
  shuffle: boolean;
}

export interface VersionImportBuild {
  folderTitle: string;
  /** Null when every version became a shuffled copy. */
  bank: QuestionBankData | null;
  quizzes: PlannedQuiz[];
}

const copyQuestion = (q: QuizQuestion): QuizQuestion => ({
  ...structuredClone(q),
  id: crypto.randomUUID(),
});

/** The bank, folder and quizzes the plan describes, still pointing at the reader's picture ids. */
export function buildVersionImport(
  set: ImportedTestSet,
  plan: VersionPlan,
  options: { folderTitle: string; now?: number }
): VersionImportBuild {
  const now = options.now ?? Date.now();
  const folderTitle = options.folderTitle.trim() || set.fileTitle;
  const byVersion = set.versions.map((v) =>
    versionQuestions(v, plan.sharedImages)
  );
  const copies = new Set(
    plan.groups
      .filter((g) => g.kind === 'duplicate' && g.create)
      .flatMap((g) => g.versions)
  );
  const bankQuestions = byVersion.flatMap((qs, v) => (copies.has(v) ? [] : qs));
  const bank: QuestionBankData | null =
    bankQuestions.length > 0
      ? {
          id: crypto.randomUUID(),
          title: folderTitle,
          questions: bankQuestions,
          createdAt: now,
          updatedAt: now,
        }
      : null;

  const quiz = (
    title: string,
    rest: Partial<
      Pick<QuizData, 'questions' | 'bankSlots' | 'order' | 'sections'>
    >
  ): QuizData => ({
    id: crypto.randomUUID(),
    title,
    questions: [],
    ...rest,
    createdAt: now,
    updatedAt: now,
  });

  const quizzes: PlannedQuiz[] = [];
  for (const g of plan.groups) {
    if (!g.create || g.versions.length === 0) continue;
    const name = g.name.trim();
    if (g.kind === 'duplicate') {
      quizzes.push({
        quiz: quiz(name, {
          questions: byVersion[g.versions[0]].map(copyQuestion),
        }),
        shuffle: true,
      });
      continue;
    }
    if (g.kind === 'split') {
      const sections: QuizSection[] = [];
      const order: QuizOrderEntry[] = [];
      const questions: QuizQuestion[] = [];
      for (const v of g.versions) {
        const section = {
          id: crypto.randomUUID(),
          title: set.versions[v].label,
        };
        sections.push(section);
        order.push({ kind: 'section', id: section.id });
        for (const q of byVersion[v].map(copyQuestion)) {
          questions.push(q);
          order.push({ kind: 'question', id: q.id });
        }
      }
      quizzes.push({
        quiz: quiz(name, { questions, sections, order }),
        shuffle: false,
      });
      continue;
    }
    // One question a version: a slot deals one version per student (V8).
    if (bank && g.versions.every((v) => byVersion[v].length === 1)) {
      const pool = g.versions.map((v) => byVersion[v][0]);
      const points = pool[0].points;
      const slot: QuizBankSlot = {
        id: crypto.randomUUID(),
        bankId: bank.id,
        bankTitle: bank.title,
        mode: 'random',
        count: 1,
        questionIds: pool.map((q) => q.id),
        ...(points !== undefined && pool.every((q) => q.points === points)
          ? { points }
          : {}),
      };
      quizzes.push({
        quiz: quiz(name, {
          bankSlots: [slot],
          order: [{ kind: 'slot', id: slot.id }],
        }),
        shuffle: false,
      });
      continue;
    }
    // Whole tests can't be dealt by one slot, so each version is its own quiz.
    for (const v of g.versions) {
      quizzes.push({
        quiz: quiz(
          g.versions.length > 1 ? `${name} (${set.versions[v].label})` : name,
          { questions: byVersion[v].map(copyQuestion) }
        ),
        shuffle: false,
      });
    }
  }
  return { folderTitle, bank, quizzes };
}

/** Uploads every picture once, then hands each item only the stimuli its questions use. */
export async function withUploadedPictures(
  build: VersionImportBuild,
  upload: (all: QuizData) => Promise<QuizData>
): Promise<VersionImportBuild> {
  const all = [
    ...(build.bank?.questions ?? []),
    ...build.quizzes.flatMap((p) => p.quiz.questions),
  ];
  if (!all.some((q) => q.stimulusIds?.length)) return build;
  const now = Date.now();
  const uploaded = await upload({
    id: crypto.randomUUID(),
    title: build.folderTitle,
    questions: all,
    createdAt: now,
    updatedAt: now,
  });
  const byId = new Map(uploaded.questions.map((q) => [q.id, q]));
  const take = (questions: QuizQuestion[]) => {
    const next = questions.map((q) => byId.get(q.id) ?? q);
    const used = new Set(next.flatMap((q) => q.stimulusIds ?? []));
    const stimuli = (uploaded.stimuli ?? []).filter((s) => used.has(s.id));
    return { questions: next, ...(stimuli.length > 0 ? { stimuli } : {}) };
  };
  return {
    ...build,
    bank: build.bank ? { ...build.bank, ...take(build.bank.questions) } : null,
    quizzes: build.quizzes.map((p) => ({
      ...p,
      quiz: { ...p.quiz, ...take(p.quiz.questions) },
    })),
  };
}

/** Two or more distinct version marks in a plain read, so review can say versions need the AI reader (V13). */
export function looksVersioned(texts: readonly string[]): boolean {
  const marks = new Set<string>();
  const pattern =
    /\b(?:version|form)\s+(?:[a-h]|\d{1,2})\b|\breassessment\b|\bretake\b|\bsplit\s+pt\.?\s*\d\b/gi;
  for (const text of texts)
    for (const m of text.matchAll(pattern))
      marks.add(m[0].toLowerCase().replace(/\s+/g, ' '));
  return marks.size >= 2;
}

export const VERSIONS_NEED_AI =
  'This file looks like it has more than one version. Turn on the AI reader to split it into versions.';

/** The wizard's warnings list for a versioned read, each note named by where it came from. */
export function testSetWarnings(set: ImportedTestSet): string[] {
  return [
    ...set.warnings,
    ...set.versions.flatMap((v) => [
      ...v.warnings.map((w) => `${v.label}: ${w}`),
      ...v.questions.flatMap((q) => q.warnings.map((w) => `${v.label}: ${w}`)),
    ]),
    ...set.rubrics.flatMap((r) => r.warnings.map((w) => `${r.label}: ${w}`)),
  ];
}

// Keyed by the stand-in quiz's id, like reviewExtras: the wizard only carries QuizData.
const versionImports = new Map<
  string,
  { set: ImportedTestSet; plan: VersionPlan }
>();

export const versionImportFor = (
  data: Pick<QuizData, 'id'>
): { set: ImportedTestSet; plan: VersionPlan } | undefined =>
  versionImports.get(data.id);

/** The stand-in quiz the wizard carries for a versioned read. */
export function registerVersionImport(
  set: ImportedTestSet,
  plan: VersionPlan = initialVersionPlan(set)
): QuizData {
  const now = Date.now();
  const data: QuizData = {
    id: crypto.randomUUID(),
    title: set.fileTitle,
    questions: [],
    createdAt: now,
    updatedAt: now,
  };
  versionImports.set(data.id, { set, plan });
  return data;
}

/** A fresh stand-in carrying the teacher's edited plan. */
export function withVersionPlan(data: QuizData, plan: VersionPlan): QuizData {
  const entry = versionImports.get(data.id);
  if (entry) versionImports.set(data.id, { ...entry, plan });
  return { ...data, updatedAt: Date.now() };
}
