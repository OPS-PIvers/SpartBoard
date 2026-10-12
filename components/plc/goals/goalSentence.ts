// Builds one SMART goal sentence from the goal editor's pieces.

export const GOAL_SENTENCE_MAX = 600;

export interface GoalSentenceParts {
  /** YYYY-MM-DD */
  dueDate?: string;
  students?: string;
  outcome?: string;
  baseline?: number;
  target?: number;
  measure?: string;
  /** Practice wording, routine names already resolved. */
  practices?: string[];
}

const trimEnd = (s: string) => s.trim().replace(/[\s.,;:]+$/, '');
const dropLead = (s: string, word: string) =>
  s.replace(new RegExp(`^${word}\\s+`, 'i'), '');

export function formatGoalDate(dateKey: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function joinList(items: string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Null until the outcome ("will ...") is filled in. */
export function buildGoalSentence(parts: GoalSentenceParts): string | null {
  const outcome = dropLead(trimEnd(parts.outcome ?? ''), 'will');
  if (!outcome) return null;
  const who = trimEnd(parts.students ?? '') || 'students';
  const subject =
    parts.target !== undefined ? `${parts.target}% of ${who}` : who;
  const clauses = [`${subject} will ${outcome}`];
  if (parts.baseline !== undefined && parts.target !== undefined) {
    clauses.push(`up from ${parts.baseline}%`);
  }
  const measure = dropLead(
    dropLead(trimEnd(parts.measure ?? ''), 'as measured by'),
    'on'
  );
  if (measure) clauses.push(`as measured by ${measure}`);
  const practices = (parts.practices ?? [])
    .map((p) => dropLead(trimEnd(p), 'by'))
    .filter(Boolean);
  if (practices.length) clauses.push(`by ${joinList(practices)}`);
  const date = parts.dueDate ? formatGoalDate(parts.dueDate) : null;
  const body = clauses.join(', ');
  const sentence = date
    ? `By ${date}, ${body}`
    : body.charAt(0).toUpperCase() + body.slice(1);
  return `${sentence}.`;
}
