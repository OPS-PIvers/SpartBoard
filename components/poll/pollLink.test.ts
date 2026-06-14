import { describe, it, expect, afterEach } from 'vitest';
import {
  encodePollData,
  buildPublicPollLink,
  decodePollPayload,
  type PollVotePayload,
} from './pollLink';

const payload: PollVotePayload = {
  id: 'session-abc',
  question: 'Best season?',
  options: [
    { id: 'o1', label: 'Spring' },
    { id: 'o2', label: 'Fall' },
  ],
  teacherUid: 'teacher-1',
};

// decodePollPayload reads window.location.search; set it per-test.
const setSearch = (search: string) => {
  window.history.replaceState({}, '', `/poll/session-abc${search}`);
};

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('pollLink', () => {
  it('round-trips a payload through encode → decode', () => {
    const encoded = encodePollData(payload);
    setSearch(`?data=${encoded}`);
    expect(decodePollPayload()).toEqual(payload);
  });

  it('buildPublicPollLink embeds the pollId path and ?data= payload', () => {
    const link = buildPublicPollLink(payload);
    expect(link).toContain('/poll/session-abc?data=');
    const data = link.split('data=')[1];
    setSearch(`?data=${data}`);
    expect(decodePollPayload()?.question).toBe('Best season?');
  });

  it('returns null when there is no ?data= param', () => {
    setSearch('');
    expect(decodePollPayload()).toBeNull();
  });

  it('returns null for a malformed ?data= param', () => {
    setSearch('?data=not-valid-base64-%%%');
    expect(decodePollPayload()).toBeNull();
  });

  it('returns null when the decoded JSON is missing required fields', () => {
    const bad = encodeURIComponent(btoa(JSON.stringify({ id: 'x' })));
    setSearch(`?data=${bad}`);
    expect(decodePollPayload()).toBeNull();
  });
});
