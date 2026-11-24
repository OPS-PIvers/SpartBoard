// Modification groups: students who share one set of rules, expanded into per-student overrides at assign time.
import type {
  ClassRoster,
  QuizQuestion,
  QuizSupport,
  StudentOverride,
} from '@/types';
import { toOverrideEditorQuestions } from '../toOverrideEditorQuestions';
import { translateHiddenOptionIdsToText } from '@/utils/quizHiddenOptions';
import type { ClassStudentRow } from '@/utils/studentTargetRef';
import type { OverrideEditorQuestion } from '../OverrideEditorRow';
import type { AssignClassesValue } from './assignClassesValue';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';

export type AnswerChoicesRule = 'all' | 'drop-one' | 'two';
export type TimeRule = 'standard' | 1.5 | 2 | 'unlimited';

export interface ModificationGroup {
  id: string;
  /** `studentTargetRefKey` of each student in the group. */
  studentKeys: string[];
  answerChoices: AnswerChoicesRule;
  time: TimeRule;
  readAloud: boolean;
  speechToText: boolean;
  /** BCP-47 code; absent = each student's own. */
  language?: string;
  supports?: QuizSupport[];
  modifiedQuestions?: boolean;
  /** Quiz question ids these students answer; absent = every question. */
  questionIds?: string[];
  /** Prints this group's version on paper at assign; scans join the same results. */
  printed?: boolean;
  /** Class focus rules the step has no row for, kept from the class's standing settings. */
  carried?: CarriedRules;
}

export type CarriedRules = Pick<
  StudentOverride,
  'blockCopyPaste' | 'tabWarningThreshold' | 'tabAwayLimit'
>;

export const MAX_SUPPORTS = 5;

let groupSeq = 0;
export const newModificationGroup = (): ModificationGroup => ({
  id: `group-${Date.now().toString(36)}-${(groupSeq += 1)}`,
  studentKeys: [],
  answerChoices: 'all',
  time: 'standard',
  readAloud: false,
  speechToText: false,
});

const TIME_FROM_STANDING: Record<string, TimeRule> = {
  '1.5': 1.5,
  '2': 2,
  unlimited: 'unlimited',
};

/** A class's standing settings as a group, so the step shows what the class presets apply. */
export function groupFromStanding(
  standing: StudentOverride,
  studentKeys: string[]
): ModificationGroup {
  const carried: CarriedRules = {};
  if (standing.blockCopyPaste !== undefined)
    carried.blockCopyPaste = standing.blockCopyPaste;
  if (standing.tabWarningThreshold !== undefined)
    carried.tabWarningThreshold = standing.tabWarningThreshold;
  if (standing.tabAwayLimit !== undefined)
    carried.tabAwayLimit = standing.tabAwayLimit;
  return {
    ...newModificationGroup(),
    studentKeys,
    answerChoices: standingAnswerChoicesRule(standing),
    time:
      standing.timeMultiplier === undefined
        ? 'standard'
        : (TIME_FROM_STANDING[String(standing.timeMultiplier)] ?? 'standard'),
    readAloud: standing.readAloud === true,
    speechToText: standing.speechToText === true,
    ...(standing.language ? { language: standing.language } : {}),
    ...(standing.supports?.length
      ? { supports: standing.supports.slice(0, MAX_SUPPORTS) }
      : {}),
    ...(standing.modifiedQuestions ? { modifiedQuestions: true } : {}),
    ...(standing.questionIds?.length
      ? { questionIds: [...standing.questionIds] }
      : {}),
    ...(Object.keys(carried).length > 0 ? { carried } : {}),
  };
}

const sortedJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      : v
  );

/** One group per distinct standing setting among rows not seeded yet, in row order. */
export function standingGroupsFor(
  rows: ClassStudentRow[],
  seeded: ReadonlySet<string>
): ModificationGroup[] {
  const buckets = new Map<
    string,
    { standing: StudentOverride; keys: string[] }
  >();
  for (const row of rows) {
    if (!row.defaultOverride || seeded.has(row.key)) continue;
    const id = sortedJson(row.defaultOverride);
    const bucket = buckets.get(id);
    if (bucket) bucket.keys.push(row.key);
    else buckets.set(id, { standing: row.defaultOverride, keys: [row.key] });
  }
  return [...buckets.values()].map((b) =>
    groupFromStanding(b.standing, b.keys)
  );
}

/** True for the step's starting group: nobody in it and nothing set. */
export const isBlankGroup = (g: ModificationGroup): boolean =>
  g.studentKeys.length === 0 &&
  g.answerChoices === 'all' &&
  g.time === 'standard' &&
  !g.readAloud &&
  !g.speechToText &&
  !g.language &&
  !g.supports?.length &&
  !g.modifiedQuestions &&
  !g.questionIds?.length &&
  !g.printed &&
  !g.carried;

/** Adds the class presets of newly reached students as groups; a blank starting group gives way. */
export function withStandingGroups(
  groups: ModificationGroup[],
  rows: ClassStudentRow[],
  seeded: ReadonlySet<string>
): ModificationGroup[] {
  const added = standingGroupsFor(rows, seeded);
  if (added.length === 0) return groups;
  return [...groups.filter((g) => !isBlankGroup(g)), ...added];
}

/** Drive file ids of class preset supports, which the step must never delete. */
export const standingDriveFileIds = (rows: ClassStudentRow[]): Set<string> =>
  new Set(
    rows.flatMap((row) =>
      (row.defaultOverride?.supports ?? []).flatMap((s) =>
        s.kind === 'drive' ? [s.fileId] : []
      )
    )
  );

/** Rows the Classes step sends the assignment to, so a group can't pick a student who won't get it. */
export function rowsInClasses(
  rows: ClassStudentRow[],
  classes: AssignClassesValue,
  rosters: ClassRoster[]
): ClassStudentRow[] {
  const sent = new Set<string>();
  for (const roster of rosters) {
    if (!classes.classIds.includes(roster.id)) continue;
    const picked = classes.studentsByClass[roster.id];
    if (picked && picked.length > 0) {
      for (const ref of picked) sent.add(studentTargetRefKey(ref));
      continue;
    }
    for (const student of roster.students) {
      const ref = resolveStudentTargetRef(student, roster);
      if (ref) sent.add(studentTargetRefKey(ref));
    }
  }
  return rows.filter((row) => sent.has(row.key));
}

// Stable per-question pick so every student in a group sees the same choices.
const hashIndex = (seed: string, size: number): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1)
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % size;
};

/** `count` question ids drawn at random, kept in quiz order. */
export function randomQuestionPick(
  questions: readonly { id: string }[],
  count: number,
  random: () => number = Math.random
): string[] {
  const ids = questions.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const keep = new Set(ids.slice(0, Math.max(1, count)));
  return questions.filter((q) => keep.has(q.id)).map((q) => q.id);
}

/** Structured option ids to hide for an answer-choices rule; never the correct option. */
export function hiddenOptionIdsForRule(
  questions: OverrideEditorQuestion[],
  rule: AnswerChoicesRule
): Record<string, string[]> | undefined {
  if (rule === 'all') return undefined;
  const out: Record<string, string[]> = {};
  for (const q of questions) {
    const wrong = (q.options ?? []).filter((o) => !o.isCorrect);
    // One wrong answer must always stay, so a question with one has nothing to drop.
    if (wrong.length < 2) continue;
    const pick = hashIndex(q.id, wrong.length);
    out[q.id] =
      rule === 'drop-one'
        ? [wrong[pick].id]
        : wrong.filter((_, i) => i !== pick).map((o) => o.id);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A class's standing answer choices (stored as Flashcards' 3 or 2) as a quiz rule. */
export const standingAnswerChoicesRule = (
  standing: StudentOverride | undefined
): AnswerChoicesRule =>
  standing?.answerChoices === 3
    ? 'drop-one'
    : standing?.answerChoices === 2
      ? 'two'
      : 'all';

/** Overrides whose answer choices (3 or 2) become this quiz's hidden option texts. */
export function withQuizAnswerChoices(
  overridesByKey: Record<string, StudentOverride>,
  questions: QuizQuestion[]
): Record<string, StudentOverride> {
  const needed = Object.values(overridesByKey).some(
    (o) => !!o.answerChoices && !o.hiddenOptionIdsByQuestion
  );
  if (!needed || !Array.isArray(questions)) return overridesByKey;
  const editorQuestions = toOverrideEditorQuestions({ questions });
  const pending: Record<string, StudentOverride> = {};
  for (const [key, o] of Object.entries(overridesByKey)) {
    const rule = standingAnswerChoicesRule(o);
    if (rule === 'all' || o.hiddenOptionIdsByQuestion) continue;
    const hidden = hiddenOptionIdsForRule(editorQuestions, rule);
    if (hidden) pending[key] = { ...o, hiddenOptionIdsByQuestion: hidden };
  }
  if (Object.keys(pending).length === 0) return overridesByKey;
  return {
    ...overridesByKey,
    ...translateHiddenOptionIdsToText(questions, pending).overridesByKey,
  };
}

const CHOICE_RANK: Record<AnswerChoicesRule, number> = {
  all: 0,
  'drop-one': 1,
  two: 2,
};

const TIME_RANK = { 1.5: 1, 2: 2, unlimited: 3 } as const;

// A group never shortens a standing accommodation's extra time.
const moreTime = (
  standing: StudentOverride['timeMultiplier'],
  rule: Exclude<TimeRule, 'standard'>
): Exclude<TimeRule, 'standard'> =>
  standing && TIME_RANK[standing] > TIME_RANK[rule] ? standing : rule;

/** One group's rules on top of a student's standing accommodation. */
export function overrideForGroup(
  group: ModificationGroup,
  standing: StudentOverride | undefined,
  /** Omit to leave the answer-choice rule for assign to apply to the served questions. */
  questions?: OverrideEditorQuestion[]
): StudentOverride {
  const next: StudentOverride = { ...(standing ?? {}) };
  if (group.time !== 'standard')
    next.timeMultiplier = moreTime(standing?.timeMultiplier, group.time);
  // A group never loosens a standing answer-choice rule.
  const standingRule = standingAnswerChoicesRule(standing);
  const rule =
    CHOICE_RANK[group.answerChoices] >= CHOICE_RANK[standingRule]
      ? group.answerChoices
      : standingRule;
  if (questions) {
    const hidden = hiddenOptionIdsForRule(questions, rule);
    if (hidden) next.hiddenOptionIdsByQuestion = hidden;
  } else if (rule !== 'all') {
    // Assign turns this into hidden options over every served question, bank draws included.
    next.answerChoices = rule === 'drop-one' ? 3 : 2;
  }
  if (group.readAloud) next.readAloud = true;
  if (group.speechToText) next.speechToText = true;
  if (group.language) next.language = group.language;
  if (group.supports?.length) {
    // Group supports join the student's own, never replace them.
    const merged = [...(standing?.supports ?? [])];
    for (const s of group.supports)
      if (!merged.some((m) => JSON.stringify(m) === JSON.stringify(s)))
        merged.push(s);
    next.supports = merged.slice(0, MAX_SUPPORTS);
  }
  if (group.modifiedQuestions) next.modifiedQuestions = true;
  if (group.questionIds?.length) next.questionIds = [...group.questionIds];
  if (group.printed) next.onPaper = true;
  if (group.carried) Object.assign(next, group.carried);
  return next;
}

/** Per-student overrides: the step shows every class preset as a group, so its groups are the whole truth. */
export function overridesFromGroups(
  groups: ModificationGroup[],
  rows: ClassStudentRow[],
  /** Preset students the step has shown; only they can be taken out of their preset. */
  seeded: ReadonlySet<string>
): Record<string, StudentOverride> {
  const rowByKey = new Map(rows.map((row) => [row.key, row] as const));
  const out: Record<string, StudentOverride> = {};
  for (const group of groups) {
    for (const key of group.studentKeys) {
      if (!rowByKey.has(key)) continue;
      out[key] = overrideForGroup(group, undefined);
    }
  }
  // A preset student the teacher took out of every group gets nothing this time.
  for (const row of rows)
    if (row.defaultOverride && seeded.has(row.key) && !(row.key in out))
      out[row.key] = {};
  return out;
}

/** A printed group and its students' roster rows, in group order. */
export interface PrintedGroupPick {
  group: ModificationGroup;
  /** 1-based position among the step's groups, for "Group 2". */
  number: number;
  students: { rosterId: string; studentId: string }[];
  /** One student's copy from the monitor; labeled as a student copy, never "Group N". */
  single?: true;
  /** Option text left off per question id, for a student copy's own hidden choices. */
  hiddenChoices?: Record<string, string[]>;
  /** The questions a student copy prints, when the student was given only some. */
  questionIds?: string[];
}

/** Printed groups with at least one student the assignment reaches. */
export function printedGroupPicks(
  groups: ModificationGroup[],
  rows: ClassStudentRow[]
): PrintedGroupPick[] {
  const rowByKey = new Map(rows.map((row) => [row.key, row] as const));
  return groups.flatMap((group, i) => {
    if (!group.printed) return [];
    const students = group.studentKeys.flatMap((key) => {
      const row = rowByKey.get(key);
      return row ? [{ rosterId: row.rosterId, studentId: row.studentId }] : [];
    });
    return students.length > 0 ? [{ group, number: i + 1, students }] : [];
  });
}

/** Puts the students in this group only, taking them out of any other group. */
export function withGroupStudents(
  groups: ModificationGroup[],
  groupId: string,
  studentKeys: string[]
): ModificationGroup[] {
  const picked = new Set(studentKeys);
  return groups.map((g) =>
    g.id === groupId
      ? { ...g, studentKeys }
      : { ...g, studentKeys: g.studentKeys.filter((k) => !picked.has(k)) }
  );
}

/** Rule labels for a closed group or the step summary, e.g. "1.5x time, 2 answer choices". */
export function groupRuleLabels(
  group: ModificationGroup,
  languageLabel?: (code: string) => string
): string[] {
  const parts: string[] = [];
  if (group.time === 'unlimited') parts.push('no time limit');
  else if (group.time !== 'standard') parts.push(`${group.time}x time`);
  if (group.answerChoices === 'drop-one') parts.push('1 wrong answer removed');
  if (group.answerChoices === 'two') parts.push('2 answer choices');
  if (group.modifiedQuestions) parts.push('modified questions');
  const fewer = group.questionIds?.length ?? 0;
  if (fewer > 0) parts.push(fewer === 1 ? '1 question' : `${fewer} questions`);
  if (group.readAloud) parts.push('read aloud');
  if (group.speechToText) parts.push('speech to text');
  if (group.language)
    parts.push(languageLabel ? languageLabel(group.language) : group.language);
  const supports = group.supports?.length ?? 0;
  if (supports > 0)
    parts.push(supports === 1 ? '1 support' : `${supports} supports`);
  if (group.printed) parts.push('printed version');
  return parts;
}

const studentsLabel = (n: number) => (n === 1 ? '1 student' : `${n} students`);

/** Closed-step value: "None", "3 students: 1.5x time", "4 students in 2 groups". */
export function formatModificationGroupsValue(
  groups: ModificationGroup[],
  inScopeKeys: Set<string>,
  languageLabel?: (code: string) => string
): string {
  const active = groups
    .map((g) => ({
      ...g,
      studentKeys: g.studentKeys.filter((k) => inScopeKeys.has(k)),
    }))
    .filter((g) => g.studentKeys.length > 0);
  if (active.length === 0) return 'None';
  const total = active.reduce((n, g) => n + g.studentKeys.length, 0);
  if (active.length > 1)
    return `${studentsLabel(total)} in ${active.length} groups`;
  const rules = groupRuleLabels(active[0], languageLabel);
  return rules.length > 0
    ? `${studentsLabel(total)}: ${rules.join(', ')}`
    : studentsLabel(total);
}

// Per-student fields the groups never set, so an edit keeps them.
const KEPT_ON_EDIT = [
  'rubricOverrideByQuestion',
  'spellingHelp',
  'openAt',
  'closeAt',
  'onPaper',
] as const satisfies readonly (keyof StudentOverride)[];

/** A saved override as the groups see it: only the rules a group sets. */
export function groupRulesOf(
  saved: StudentOverride | undefined
): StudentOverride | undefined {
  if (!saved) return undefined;
  const rules: StudentOverride = { ...saved };
  for (const field of KEPT_ON_EDIT) delete rules[field];
  delete rules.hiddenOptionIdsByQuestion;
  return Object.keys(rules).length > 0 ? rules : undefined;
}

/** Overrides after editing a live assignment: a student whose rules didn't change keeps their saved override exactly. */
export function editedOverrides(
  saved: Record<string, StudentOverride>,
  /** `overridesFromGroups` for the groups the step opened with. */
  baseline: Record<string, StudentOverride>,
  /** `overridesFromGroups` for the groups now. */
  next: Record<string, StudentOverride>
): Record<string, StudentOverride> {
  const out: Record<string, StudentOverride> = { ...saved };
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(next)])) {
    const now = next[key];
    if (sortedJson(baseline[key]) === sortedJson(now)) continue;
    const before = saved[key];
    const merged: StudentOverride = {};
    for (const field of KEPT_ON_EDIT)
      if (before?.[field] !== undefined)
        Object.assign(merged, { [field]: before[field] });
    // Hand-picked hidden options stay unless the group now sets an answer-choice rule.
    if (
      before?.hiddenOptionIdsByQuestion &&
      !before.answerChoices &&
      !now?.answerChoices
    )
      merged.hiddenOptionIdsByQuestion = before.hiddenOptionIdsByQuestion;
    Object.assign(merged, now ?? {});
    if (Object.keys(merged).length > 0) out[key] = merged;
    else delete out[key];
  }
  return out;
}
