import { describe, expect, it } from 'vitest';
import {
  deckEmbedUrl,
  familyPageUrl,
  parseFamilyPath,
  readFamilyPage,
} from './familyPageModel';

describe('parseFamilyPath', () => {
  it('reads a share id, with or without a trailing slash', () => {
    expect(parseFamilyPath('/family/AbC_12-x')).toBe('AbC_12-x');
    expect(parseFamilyPath('/family/AbC_12-x/')).toBe('AbC_12-x');
  });

  it('refuses anything that is not one safe id', () => {
    for (const path of [
      '/family/',
      '/family',
      '/family/a/b',
      '/family/..',
      '/family/%2E%2E',
      '/family/a%2Fb',
      '/family/%E0%A4%A',
      `/family/${'a'.repeat(129)}`,
      '/familyx/abc',
    ])
      expect(parseFamilyPath(path)).toBeNull();
  });
});

describe('readFamilyPage', () => {
  it('drops unsafe links and a bad deck id from a stored copy', () => {
    const page = readFamilyPage({
      courseName: '  English   9 ',
      teacherName: 'T',
      agenda: { fileId: 'x"/><script>', title: 'A' },
      pinnedLinks: [
        { title: 'bad', url: 'javascript:alert(1)' },
        { title: 'data', url: 'data:text/html,hi' },
        { title: 'ok', url: 'https://example.com/a' },
      ],
      updatedAt: 5,
    });
    expect(page).toEqual({
      courseName: 'English 9',
      teacherName: 'T',
      agenda: null,
      pinnedLinks: [{ title: 'ok', url: 'https://example.com/a' }],
      updatedAt: 5,
    });
  });

  it('treats a copy with no Course name, or no data, as unavailable', () => {
    expect(readFamilyPage(undefined)).toBeNull();
    expect(readFamilyPage({ courseName: '  ' })).toBeNull();
  });
});

describe('addresses', () => {
  it('builds the shared address and the deck preview', () => {
    expect(familyPageUrl('https://spartboard.web.app', 'abc')).toBe(
      'https://spartboard.web.app/family/abc'
    );
    expect(deckEmbedUrl('1AbCdEfGhIjK')).toBe(
      'https://docs.google.com/presentation/d/1AbCdEfGhIjK/preview'
    );
  });
});
