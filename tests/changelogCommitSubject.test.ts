import { describe, expect, it } from 'vitest';
import {
  classifyCommit,
  stripCommitPrefix,
} from '@/scripts/changelogCommitSubject';

describe('changelog commit subjects', () => {
  it('classifies breaking-change commits like their non-breaking forms', () => {
    expect(classifyCommit('feat!: new board model')).toBe('feature');
    expect(classifyCommit('fix(quiz)!: drop legacy scores')).toBe('fix');
    expect(classifyCommit('refactor!: rework sync')).toBe('improvement');
  });

  it('keeps classifying ordinary commits', () => {
    expect(classifyCommit('feat(quiz): add timer')).toBe('feature');
    expect(classifyCommit("'fix: typo'")).toBe('fix');
    expect(classifyCommit('chore: bump')).toBeNull();
  });

  it('strips the breaking marker from the text', () => {
    expect(stripCommitPrefix('feat(quiz)!: add timer (#12)')).toBe('add timer');
  });
});
