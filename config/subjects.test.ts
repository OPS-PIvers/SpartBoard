import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUBJECTS,
  normalizeSubjectsDoc,
  subjectIdFromLabel,
} from './subjects';

describe('subjects config', () => {
  it('falls back to the defaults for a missing doc', () => {
    expect(normalizeSubjectsDoc(undefined).subjects).toEqual(DEFAULT_SUBJECTS);
    expect(normalizeSubjectsDoc({ subjects: [] }).subjects).toEqual(
      DEFAULT_SUBJECTS
    );
  });

  it('keeps catalog subjects present and never archived', () => {
    const doc = normalizeSubjectsDoc({
      subjects: [
        { id: 'ela', label: 'ELA', archived: true },
        { id: 'math', label: 'Math', archived: true },
        { id: 'bad' },
      ],
      updatedAt: 5,
    });
    expect(doc.updatedAt).toBe(5);
    expect(doc.subjects).toEqual([
      { id: 'ela', label: 'ELA' },
      { id: 'math', label: 'Math', archived: true },
      { id: 'social-studies', label: 'Social Studies' },
    ]);
  });

  it('builds ids from labels', () => {
    expect(subjectIdFromLabel('  Computer Science! ')).toBe('computer-science');
    expect(subjectIdFromLabel('***')).toBe('');
  });
});
