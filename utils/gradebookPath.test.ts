import { describe, expect, it } from 'vitest';
import {
  buildGradebookPath,
  isGradebookRoute,
  parseGradebookPath,
} from './gradebookPath';

describe('gradebookPath', () => {
  it('parses every route in D4', () => {
    expect(parseGradebookPath('/gradebook')).toEqual({
      rosterId: null,
      view: 'grid',
      studentUid: null,
      sessionId: null,
    });
    expect(parseGradebookPath('/gradebook/r1/')).toMatchObject({
      rosterId: 'r1',
      view: 'grid',
    });
    expect(parseGradebookPath('/gradebook/r1/analysis')).toMatchObject({
      view: 'analysis',
    });
    expect(parseGradebookPath('/gradebook/r1/student/u%2F1')).toMatchObject({
      view: 'student',
      studentUid: 'u/1',
    });
    expect(parseGradebookPath('/gradebook/r1/assignment/s1')).toMatchObject({
      view: 'assignment',
      sessionId: 's1',
    });
  });

  it('falls back to the grid for unknown or incomplete sections', () => {
    expect(parseGradebookPath('/gradebook/r1/nope')?.view).toBe('grid');
    expect(parseGradebookPath('/gradebook/r1/student')?.view).toBe('grid');
  });

  it('ignores other routes', () => {
    expect(isGradebookRoute('/gradebooks')).toBe(false);
    expect(parseGradebookPath('/plc/x')).toBeNull();
  });

  it('round-trips built paths', () => {
    for (const path of [
      buildGradebookPath('r 1'),
      buildGradebookPath('r1', 'analysis'),
      buildGradebookPath('r1', 'student', 'u1'),
      buildGradebookPath('r1', 'assignment', 's1'),
    ]) {
      const p = parseGradebookPath(path);
      expect(p).not.toBeNull();
      if (!p) continue;
      expect(
        buildGradebookPath(p.rosterId, p.view, p.studentUid ?? p.sessionId)
      ).toBe(path);
    }
    expect(buildGradebookPath(null)).toBe('/gradebook');
  });
});
