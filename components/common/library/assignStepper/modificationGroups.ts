// Modification groups: students who share one set of rules, expanded into per-student overrides at assign time.
import type { StudentOverride } from '@/types';
import type { ClassStudentRow } from '@/utils/studentTargetRef';
import type { OverrideEditorQuestion } from '../OverrideEditorRow';
import type { AssignClassesValue } from './assignClassesValue';
import { studentTargetRefKey } from '@/utils/studentTargetRef';

export type AnswerChoicesRule = 'all' | 'drop-one' | 'two';
export type TimeRule = 'standard' | 1.5 | 2 | 'unlimited';

export interface ModificationGroup {
  id: string;
  /** `studentTargetRefKey` of each student in the group. */
  studentKeys: string[];
  answerChoices: AnswerChoicesRule;
  time: TimeRule;
  readAloud: boolean;
  /** BCP-47 code; absent = each student's own. */
  language?: string;
}

let groupSeq = 0;
export const newModificationGroup = (): ModificationGroup => ({
  id: `group-${Date.now().toString(36)}-${(groupSeq += 1)}`,
  studentKeys: [],
  answerChoices: 'all',
  time: 'standard',
  readAloud: false,
});

/** Rows the Classes step sends the assignment to, so a group can't pick a student who won't get it. */
export function rowsInClasses(
  rows: ClassStudentRow[],
  classes: AssignClassesValue
): ClassStudentRow[] {
  return rows.filter((row) => {
    if (!classes.classIds.includes(row.rosterId)) return false;
    const picked = classes.studentsByClass[row.rosterId];
    if (!picked || picked.length === 0) return true;
    return picked.some((ref) => studentTargetRefKey(ref) === row.key);
  });
}

// Stable per-question pick so every student in a group sees the same choices.
const hashIndex = (seed: string, size: number): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1)
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % size;
};

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

/** One group's rules on top of a student's standing accommodation. */
export function overrideForGroup(
  group: ModificationGroup,
  standing: StudentOverride | undefined,
  questions: OverrideEditorQuestion[]
): StudentOverride {
  const next: StudentOverride = { ...(standing ?? {}) };
  if (group.time !== 'standard') next.timeMultiplier = group.time;
  const hidden = hiddenOptionIdsForRule(questions, group.answerChoices);
  if (hidden) next.hiddenOptionIdsByQuestion = hidden;
  if (group.readAloud) next.readAloud = true;
  if (group.language) next.language = group.language;
  return next;
}

/** Per-student overrides for every grouped student; anyone else keeps their standing accommodation. */
export function overridesFromGroups(
  groups: ModificationGroup[],
  rows: ClassStudentRow[],
  questions: OverrideEditorQuestion[]
): Record<string, StudentOverride> {
  const rowByKey = new Map(rows.map((row) => [row.key, row] as const));
  const out: Record<string, StudentOverride> = {};
  for (const group of groups) {
    for (const key of group.studentKeys) {
      const row = rowByKey.get(key);
      if (!row) continue;
      out[key] = overrideForGroup(group, row.defaultOverride, questions);
    }
  }
  return out;
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
  if (group.readAloud) parts.push('read aloud');
  if (group.language)
    parts.push(languageLabel ? languageLabel(group.language) : group.language);
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
