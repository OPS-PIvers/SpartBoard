import { describe, it, expect } from 'vitest';
import {
  isAiTarget,
  isDuplicate,
  nextAiBatch,
  planCourseImport,
  splitCourseRows,
  type CourseRowAccess,
  type CourseRowTarget,
} from '@/utils/import/coursePlan';
import type { CartridgeBank, CourseMaterial } from '@/utils/quizDocumentImport';
import type { ExtractedQuestion } from '@/utils/quizDocumentImport/types';

const question = { number: 1, text: 'Q' } as unknown as ExtractedQuestion;
const bank = (id: string, folderPath: string[], count = 1): CartridgeBank => ({
  id,
  title: `Bank ${id}`,
  folderPath,
  questions: Array.from({ length: count }, () => question),
  images: [],
});
const material = (m: Partial<CourseMaterial> & { id: string }) => ({
  kind: 'page',
  title: m.id,
  folderPath: [],
  ...m,
});

const ALL: CourseRowAccess = { target: () => true, ai: true, drive: true };

describe('planCourseImport', () => {
  it('guesses each kind and roots every path at the course', () => {
    const rows = planCourseImport(
      'Biology',
      [bank('t1', ['Unit 1'])],
      [bank('b1', [])],
      [
        material({ id: 'd', kind: 'discussion', text: 'Why?' }),
        material({ id: 'l', kind: 'link', url: 'https://a.org' }),
        material({ id: 'f', kind: 'file', fileName: 'Lab.pdf' }),
        material({ id: 'p', kind: 'page', text: 'Some reading' }),
      ],
      ALL
    );
    const guess = Object.fromEntries(rows.map((r) => [r.id, r.guess]));
    expect(guess).toEqual({
      'quiz:t1': 'quiz',
      'bank:b1': 'questionBank',
      'discussion:d': 'activityWall',
      'link:l': 'links',
      'file:f': 'pdf',
      'page:p': 'skip',
    });
    expect(rows.find((r) => r.id === 'quiz:t1')?.path).toEqual([
      'Biology',
      'Unit 1',
    ]);
  });

  it('keeps each folder’s items together in outline order', () => {
    const rows = planCourseImport(
      'C',
      [bank('t1', ['A'])],
      [],
      [
        material({ id: 'x', kind: 'link', url: 'https://x.org' }),
        material({
          id: 'y',
          kind: 'link',
          url: 'https://y.org',
          folderPath: ['A'],
        }),
      ],
      ALL
    );
    expect(rows.map((r) => r.id)).toEqual(['quiz:t1', 'link:y', 'link:x']);
  });

  it('guesses Flashcards for a page of terms and definitions', () => {
    const [row] = planCourseImport(
      'C',
      [],
      [],
      [
        material({
          id: 'p',
          text: 'cell | unit of life\natom | smallest part\nion | charged atom',
        }),
      ],
      ALL
    );
    expect(row.guess).toBe('flashcards');
  });

  it('offers only Skip where the teacher can’t use the target', () => {
    const rows = planCourseImport(
      'C',
      [bank('empty', [], 0)],
      [],
      [
        material({ id: 'p', text: 'Reading' }),
        material({ id: 'doc', kind: 'file', fileName: 'Notes.docx' }),
        material({ id: 'zip', kind: 'file', fileName: 'Pack.zip' }),
      ],
      { target: (t) => t !== 'flashcards', ai: false, drive: false }
    );
    for (const row of rows) expect(row.options).toEqual(['skip']);
  });

  it('offers Word files in the PDF library only with Drive', () => {
    const [row] = planCourseImport(
      'C',
      [],
      [],
      [material({ id: 'doc', kind: 'file', fileName: 'Notes.docx' })],
      ALL
    );
    expect(row.options).toEqual(['pdf', 'skip']);
  });
});

describe('splitCourseRows', () => {
  it('separates AI rows from rows saved now, leaving out skips', () => {
    const rows = planCourseImport(
      'C',
      [bank('t1', [])],
      [],
      [
        material({ id: 'p1', text: 'a' }),
        material({ id: 'p2', text: 'b' }),
        material({ id: 'd', kind: 'discussion', text: 'Why?' }),
      ],
      ALL
    );
    const picks = new Map<string, CourseRowTarget>([
      ['page:p1', 'flashcards'],
      ['quiz:t1', 'skip'],
    ]);
    const { parser, ai } = splitCourseRows(rows, picks);
    expect(parser.map((r) => r.id)).toEqual(['discussion:d']);
    expect(ai.map((r) => r.id)).toEqual(['page:p1']);
  });

  it('treats an Activity Wall as AI only for a page', () => {
    expect(isAiTarget('page', 'activityWall')).toBe(true);
    expect(isAiTarget('discussion', 'activityWall')).toBe(false);
  });

  it('queues at most 25 AI reviews at once', () => {
    expect(nextAiBatch(Array.from({ length: 30 }, (_, i) => i))).toHaveLength(
      25
    );
  });
});

describe('isDuplicate', () => {
  it('matches a title in the same folder path, ignoring case', () => {
    const folders = [
      { id: 'c', name: 'Biology', parentId: null },
      { id: 'u', name: 'Unit 1', parentId: 'c' },
    ] as never;
    const existing = [{ title: 'cells quiz', folderId: 'u' }];
    expect(
      isDuplicate(['Biology', 'Unit 1'], 'Cells Quiz', existing, folders)
    ).toBe(true);
    expect(isDuplicate(['Biology'], 'Cells Quiz', existing, folders)).toBe(
      false
    );
  });
});
