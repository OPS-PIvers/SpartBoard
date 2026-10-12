// Editor-side answer key rows and the save-time app check (docs/plans/MINI_APP_RESULTS.md D5, D12).
import type {
  MiniAppAnswerKey,
  MiniAppAnswerKeyEntry,
  MiniAppManifest,
  MiniAppQuestionType,
} from '@/types';

/** One question as the editor holds it; numbers and lists stay text until save. */
export interface MiniAppQuestionDraft {
  id: string;
  type: MiniAppQuestionType;
  prompt: string;
  points: string;
  answer: string;
  tolerance: string;
}

export const QUESTION_TYPE_LABELS: Record<MiniAppQuestionType, string> = {
  mc: 'Multiple choice',
  multi: 'Select all',
  tf: 'True or false',
  numeric: 'Number',
  short: 'Short answer',
  order: 'Put in order',
  other: 'Scored by the app',
};

const splitList = (text: string): string[] =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const scalarText = (value: unknown): string =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'
    ? String(value)
    : '';

const listText = (value: unknown): string =>
  Array.isArray(value) ? value.map(scalarText).join(', ') : '';

export function nextQuestionId(rows: MiniAppQuestionDraft[]): string {
  const taken = new Set(rows.map((r) => r.id));
  let n = rows.length + 1;
  while (taken.has(`q${n}`)) n++;
  return `q${n}`;
}

export function blankQuestion(
  rows: MiniAppQuestionDraft[]
): MiniAppQuestionDraft {
  return {
    id: nextQuestionId(rows),
    type: 'mc',
    prompt: '',
    points: '',
    answer: '',
    tolerance: '',
  };
}

export function toDrafts(
  manifest: MiniAppManifest | undefined,
  key: MiniAppAnswerKey | null
): MiniAppQuestionDraft[] {
  return (manifest?.questions ?? []).map((q) => {
    const entry = key?.questions?.[q.id];
    let answer = '';
    if (q.type === 'short') answer = (entry?.accepted ?? []).join(', ');
    else if (q.type === 'multi' || q.type === 'order')
      answer = listText(entry?.correct);
    else if (q.type === 'tf')
      answer =
        entry?.correct === undefined
          ? ''
          : scalarText(entry.correct).toLowerCase() === 'true'
            ? 'true'
            : 'false';
    else if (q.type !== 'other' && entry?.correct !== undefined)
      answer = scalarText(entry.correct);
    return {
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points === undefined ? '' : String(q.points),
      answer,
      tolerance:
        q.type === 'numeric' && entry?.tolerance ? String(entry.tolerance) : '',
    };
  });
}

function keyEntry(row: MiniAppQuestionDraft): MiniAppAnswerKeyEntry | null {
  const text = row.answer.trim();
  if (!text || row.type === 'other') return null;
  switch (row.type) {
    case 'tf':
      return { correct: text === 'true' };
    case 'numeric': {
      const value = Number(text);
      if (!Number.isFinite(value)) return null;
      const tolerance = Number(row.tolerance);
      return {
        correct: value,
        ...(Number.isFinite(tolerance) && tolerance > 0 ? { tolerance } : {}),
      };
    }
    case 'short': {
      const accepted = splitList(text);
      return accepted.length ? { accepted } : null;
    }
    case 'multi':
    case 'order': {
      const correct = splitList(text);
      return correct.length ? { correct } : null;
    }
    default:
      return { correct: text };
  }
}

export function fromDrafts(rows: MiniAppQuestionDraft[]): {
  manifest: MiniAppManifest;
  key: MiniAppAnswerKey;
} {
  const questions: MiniAppAnswerKey['questions'] = {};
  const manifest: MiniAppManifest = {
    questions: rows.map((row) => {
      const entry = keyEntry(row);
      if (entry) questions[row.id.trim()] = entry;
      const points = Number(row.points);
      return {
        id: row.id.trim(),
        type: row.type,
        prompt: row.prompt.trim(),
        ...(row.points.trim() && Number.isFinite(points) && points >= 0
          ? { points }
          : {}),
      };
    }),
  };
  return { manifest, key: { questions } };
}

/** D12 static check; each problem is one short sentence. */
export function checkMiniApp(
  html: string,
  manifest: MiniAppManifest,
  key: MiniAppAnswerKey
): string[] {
  const problems: string[] = [];
  if (!/SpartBoard\.submit\s*\(/.test(html))
    problems.push('The app never sends results to SpartBoard.');
  if (!/data-spart-submit/.test(html))
    problems.push('The app has no Submit button for SpartBoard to show.');
  const seen = new Set<string>();
  for (const q of manifest.questions) {
    if (!q.id) problems.push('Every question needs an ID.');
    else if (seen.has(q.id)) problems.push(`Two questions use the ID ${q.id}.`);
    seen.add(q.id);
  }
  for (const [id, entry] of Object.entries(key.questions)) {
    const values = [
      ...(Array.isArray(entry.correct)
        ? (entry.correct as unknown[])
        : [entry.correct]),
      ...(entry.accepted ?? []),
    ].filter((v): v is string => typeof v === 'string' && v.length > 1);
    if (values.some((v) => leaksAnswer(html, v)))
      problems.push(`The app shows the answer to ${id} in its code.`);
  }
  return [...new Set(problems)];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const leaksAnswer = (html: string, value: string): boolean =>
  new RegExp(
    `(correct|answer|solution)\\w*['"]?\\s*[:=]\\s*\\[?\\s*['"]${escape(value)}['"]`,
    'i'
  ).test(html);
