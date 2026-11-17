import type { QuizQuestion, StudentOverride } from '@/types';
import { translateHiddenOptionIdsToText } from '@/utils/quizHiddenOptions';

/** One form of an assignment the teacher can run in Student view. */
export interface StudentViewVersion {
  id: string;
  label: string;
  /** Absent for the standard version. */
  override?: StudentOverride;
}

export const STANDARD_VERSION_ID = 'standard';
export const STANDARD_VERSION: StudentViewVersion = {
  id: STANDARD_VERSION_ID,
  label: 'Standard',
};

/** Only what changes the questions a student sees; focus rules stay on the toolbar. */
export function previewOverride(
  override: StudentOverride | undefined
): StudentOverride | undefined {
  if (!override) return undefined;
  const out: StudentOverride = {};
  if (override.questionIds?.length) out.questionIds = override.questionIds;
  if (
    override.hiddenOptionIdsByQuestion &&
    Object.keys(override.hiddenOptionIdsByQuestion).length > 0
  )
    out.hiddenOptionIdsByQuestion = override.hiddenOptionIdsByQuestion;
  if (override.timeMultiplier) out.timeMultiplier = override.timeMultiplier;
  if (override.readAloud === true) out.readAloud = true;
  if (override.language) out.language = override.language;
  if (override.modifiedQuestions === true) out.modifiedQuestions = true;
  if (override.supports?.length) out.supports = override.supports;
  return Object.keys(out).length > 0 ? out : undefined;
}

const stableKey = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0
          )
        )
      : v
  );

/** Rule labels for a saved override, e.g. "1.5x time, modified questions". */
export function overrideRuleLabels(
  override: StudentOverride,
  languageLabel: (code: string) => string
): string[] {
  const parts: string[] = [];
  if (override.timeMultiplier === 'unlimited') parts.push('no time limit');
  else if (override.timeMultiplier)
    parts.push(`${override.timeMultiplier}x time`);
  const hidden = Object.values(override.hiddenOptionIdsByQuestion ?? {});
  if (hidden.length > 0)
    parts.push(
      hidden.every((ids) => ids.length === 1)
        ? '1 wrong answer removed'
        : 'fewer answer choices'
    );
  if (override.questionIds?.length)
    parts.push(
      override.questionIds.length === 1
        ? '1 question'
        : `${override.questionIds.length} questions`
    );
  if (override.modifiedQuestions) parts.push('modified questions');
  if (override.readAloud) parts.push('read aloud');
  if (override.language) parts.push(languageLabel(override.language));
  const supports = override.supports?.length ?? 0;
  if (supports > 0)
    parts.push(supports === 1 ? '1 support' : `${supports} supports`);
  return parts;
}

const studentsLabel = (n: number) => (n === 1 ? '1 student' : `${n} students`);

/** Standard plus every distinct version an assignment's saved overrides serve, most students first. */
export function versionsFromOverrides(
  overrides: Record<string, StudentOverride> | undefined,
  languageLabel: (code: string) => string
): StudentViewVersion[] {
  const byKey = new Map<string, { override: StudentOverride; count: number }>();
  for (const raw of Object.values(overrides ?? {})) {
    const override = previewOverride(raw);
    if (!override) continue;
    const key = stableKey(override);
    const entry = byKey.get(key);
    if (entry) entry.count += 1;
    else byKey.set(key, { override, count: 1 });
  }
  const versions = [...byKey.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ override, count }, i) => ({
      id: `version-${i + 1}`,
      label: `${studentsLabel(count)} · ${overrideRuleLabels(override, languageLabel).join(', ')}`,
      override,
    }));
  return [STANDARD_VERSION, ...versions];
}

/** Assign-step versions carry option ids; the student player hides by option text, as Assign saves it. */
export function versionsWithOptionText(
  versions: StudentViewVersion[],
  questions: QuizQuestion[]
): StudentViewVersion[] {
  const overrides: Record<string, StudentOverride> = {};
  for (const v of versions) if (v.override) overrides[v.id] = v.override;
  const { overridesByKey } = translateHiddenOptionIdsToText(
    questions,
    overrides
  );
  return versions.map((v) =>
    v.override ? { ...v, override: overridesByKey[v.id] } : v
  );
}
