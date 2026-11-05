import { describe, expect, it } from 'vitest';
import { contextOwner } from './backfill-lti-context-owners.mjs';

const base = {
  sessionOwner: 'teacher-a',
  sessionId: 's1',
  sessionCreatedMs: 1_000,
  contextCreatedMs: 2_000,
  seenSessionId: null as string | null,
};

describe('contextOwner', () => {
  it('stamps the owner when their seen-section record names the session', () => {
    expect(
      contextOwner({
        ...base,
        contextCreatedMs: 10,
        seenSessionId: 's1',
      })
    ).toBe('teacher-a');
  });

  it('stamps the owner when the context was created after the session', () => {
    expect(contextOwner(base)).toBe('teacher-a');
  });

  it('stamps empty when the context predates the session and nothing else vouches', () => {
    expect(contextOwner({ ...base, contextCreatedMs: 500 })).toBe('');
  });

  it('stamps empty when the seen-section record names another session', () => {
    expect(
      contextOwner({
        ...base,
        contextCreatedMs: 500,
        seenSessionId: 'other-session',
      })
    ).toBe('');
  });

  it('stamps empty without a session owner or without any create time', () => {
    expect(contextOwner({ ...base, sessionOwner: '' })).toBe('');
    expect(contextOwner({ ...base, sessionCreatedMs: null })).toBe('');
    expect(contextOwner({ ...base, contextCreatedMs: null })).toBe('');
  });
});
