export type CommitType = 'feature' | 'fix' | 'improvement';

const unquote = (subject: string) => subject.replace(/^['"]|['"]$/g, '').trim();

// `!` after the type/scope marks a breaking change in conventional commits.
export const classifyCommit = (subject: string): CommitType | null => {
  const s = unquote(subject);
  if (/^feat(\([^)]*\))?!?:/i.test(s)) return 'feature';
  if (/^fix(\([^)]*\))?!?:/i.test(s)) return 'fix';
  if (/^(perf|refactor|harden|audit)(\([^)]*\))?!?:/i.test(s))
    return 'improvement';
  return null;
};

export const stripCommitPrefix = (subject: string): string =>
  unquote(subject)
    .replace(/^[a-z]+(\([^)]+\))?!?:\s*/i, '')
    .replace(/\s*\(#\d+\)$/, '')
    .trim();
