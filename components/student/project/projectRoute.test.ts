import { describe, expect, it } from 'vitest';
import { parseProjectRunId, projectHref } from './projectRoute';

describe('projectHref', () => {
  it('escapes a run id so a odd project id cannot break the path', () => {
    expect(projectHref('uid_p1')).toBe('/project/uid_p1');
    expect(projectHref('uid_a/b')).toBe('/project/uid_a%2Fb');
  });

  it('round-trips through the parser', () => {
    const runId = 'uid_a/b c';
    expect(parseProjectRunId(projectHref(runId))).toBe(runId);
  });
});

describe('parseProjectRunId', () => {
  it('reads the run id out of the path', () => {
    expect(parseProjectRunId('/project/uid_p1')).toBe('uid_p1');
    expect(parseProjectRunId('/project/uid_p1/')).toBe('uid_p1');
  });

  it('returns null for another route or a missing id', () => {
    expect(parseProjectRunId('/my-assignments')).toBeNull();
    expect(parseProjectRunId('/project/')).toBeNull();
    expect(parseProjectRunId('/projects/uid_p1')).toBeNull();
  });

  it('returns null for a malformed escape rather than throwing', () => {
    expect(parseProjectRunId('/project/%E0%A4%A')).toBeNull();
  });
});
