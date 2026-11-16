import { describe, expect, it } from 'vitest';
import {
  classPageView,
  readClassPageCopy,
  type ClassPageCopyRow,
} from './useClassPageAgendas';

const copy = (
  teacherUid: string,
  teacherName: string,
  fileId: string | null,
  urls: string[] = []
): ClassPageCopyRow => ({
  teacherUid,
  teacherName,
  agenda: fileId ? { fileId, title: `${teacherName} deck` } : null,
  pinnedLinks: urls.map((url) => ({ title: url, url })),
});

describe('classPageView', () => {
  it('shows one unlabelled Agenda when co-teachers share a deck (D22)', () => {
    const view = classPageView([
      copy('u2', 'Mr. Lee', 'deck-aaaaaaaaaa'),
      copy('u1', 'Ms. Ortiz', 'deck-aaaaaaaaaa'),
    ]);
    expect(view.agendas).toEqual([
      { fileId: 'deck-aaaaaaaaaa', title: 'Mr. Lee deck', teacherName: null },
    ]);
  });

  it('labels each deck by teacher when they differ', () => {
    const view = classPageView([
      copy('u1', 'Ms. Ortiz', 'deck-bbbbbbbbbb'),
      copy('u2', 'Mr. Lee', 'deck-aaaaaaaaaa'),
      copy('u3', 'Mx. Kim', null),
    ]);
    expect(view.agendas.map((a) => a.teacherName)).toEqual([
      'Mr. Lee',
      'Ms. Ortiz',
    ]);
  });

  it('merges pinned links without repeats', () => {
    const view = classPageView([
      copy('u1', 'A', null, ['https://a.test/', 'https://b.test/']),
      copy('u2', 'B', null, ['https://b.test/', 'https://c.test/']),
    ]);
    expect(view.links.map((l) => l.url)).toEqual([
      'https://a.test/',
      'https://b.test/',
      'https://c.test/',
    ]);
  });

  it('is empty with no copies', () => {
    expect(classPageView([])).toEqual({ agendas: [], links: [] });
  });
});

describe('readClassPageCopy', () => {
  it('drops a bad deck id and unsafe links', () => {
    const row = readClassPageCopy('u1', {
      teacherName: 'Ms. Ortiz',
      agenda: { fileId: '../../etc', title: 'x' },
      pinnedLinks: [
        { title: 'Bad', url: 'javascript:alert(1)' },
        { title: 'Good', url: 'https://good.test/' },
      ],
    });
    expect(row).toEqual({
      teacherUid: 'u1',
      teacherName: 'Ms. Ortiz',
      agenda: null,
      pinnedLinks: [{ title: 'Good', url: 'https://good.test/' }],
    });
    expect(readClassPageCopy('u1', undefined)).toBeNull();
  });
});
