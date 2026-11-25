import { describe, it, expect } from 'vitest';
import {
  isLibrarySharePath,
  librarySharePath,
  parseLibraryShareLink,
  parseLibrarySharePath,
} from './shareRoutes';

describe('shareRoutes', () => {
  it.each([
    ['/share/quiz/q1', 'quiz', 'q1'],
    ['/share/assignment/a_1', 'assignment', 'a_1'],
    ['/share/video-activity/v-1/', 'videoActivity', 'v-1'],
    ['/share/rubric/r1', 'rubric', 'r1'],
  ])('parses %s', (path, kind, shareId) => {
    expect(parseLibrarySharePath(path)).toEqual({ kind, shareId });
  });

  it('rejects other routes and malformed ids', () => {
    expect(parseLibrarySharePath('/share/abc')).toBeNull();
    expect(parseLibrarySharePath('/share/notebook/n1')).toBeNull();
    expect(parseLibrarySharePath('/share/quiz/')).toBeNull();
    expect(parseLibrarySharePath('/share/quiz/a/b')).toBeNull();
    expect(isLibrarySharePath('/share/quiz/')).toBe(true);
    expect(isLibrarySharePath('/share/abc')).toBe(false);
  });

  it('parses pasted links with or without a scheme', () => {
    expect(
      parseLibraryShareLink('  spartboard.web.app/share/rubric/r1?x=1 ')
    ).toEqual({ kind: 'rubric', shareId: 'r1' });
    expect(parseLibraryShareLink('hello world')).toBeNull();
  });

  it('builds the path it parses', () => {
    expect(
      parseLibrarySharePath(librarySharePath('videoActivity', 'v9'))
    ).toEqual({ kind: 'videoActivity', shareId: 'v9' });
  });
});
