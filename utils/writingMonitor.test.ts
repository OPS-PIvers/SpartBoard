import { describe, expect, it } from 'vitest';
import type { WritingResponse } from '@/types';
import {
  WRITING_IDLE_MS,
  buildWritingMonitorRows,
  countWritingBuckets,
  savedAgo,
} from './writingMonitor';

const NOW = 10_000_000;

const response = (
  studentUid: string,
  o: Partial<WritingResponse> = {}
): WritingResponse => ({
  studentUid,
  classId: 'a',
  html: '',
  summary: {
    wordCount: 0,
    savedAt: NOW,
    writingMs: 0,
    sessions: 0,
    pasteCount: 0,
    pastedChars: 0,
    untypedCount: 0,
    untypedChars: 0,
    awayMs: 0,
    awayCount: 0,
  },
  status: 'draft',
  saveCount: 0,
  tabId: 't',
  logChunk: 0,
  startedAt: NOW - 1000,
  draftCount: 0,
  updatedAt: NOW,
  ...o,
});

const names = new Map([
  ['u1', { givenName: 'Ana', familyName: 'Zed' }],
  ['u2', { givenName: 'Bo', familyName: 'Adams' }],
  ['u3', { givenName: 'Cy', familyName: 'Moss' }],
  ['u4', { givenName: 'Di', familyName: 'Lee' }],
]);

describe('buildWritingMonitorRows', () => {
  it('puts opened-but-unsaved and roster-only students in Not started, sorted by last name', () => {
    const rows = buildWritingMonitorRows({
      responses: [
        response('u1'),
        response('u2', {
          saveCount: 4,
          summary: { ...response('u2').summary, wordCount: 120 },
        }),
        response('u3', { status: 'turned-in', saveCount: 9 }),
      ],
      names,
      rosterUids: ['u1', 'u4'],
      classId: '',
      now: NOW,
    });
    expect(rows.map((r) => [r.name, r.bucket])).toEqual([
      ['Bo Adams', 'inProgress'],
      ['Di Lee', 'notStarted'],
      ['Cy Moss', 'done'],
      ['Ana Zed', 'notStarted'],
    ]);
    expect(rows.find((r) => r.key === 'u4')?.response).toBeNull();
    expect(rows.find((r) => r.key === 'u2')?.wordCount).toBe(120);
    expect(countWritingBuckets(rows)).toEqual({
      notStarted: 2,
      inProgress: 1,
      done: 1,
    });
  });

  it('a revision counts as in progress and a returned piece as turned in', () => {
    const rows = buildWritingMonitorRows({
      responses: [
        response('u1', { status: 'revising', saveCount: 2 }),
        response('u2', { status: 'returned', saveCount: 2 }),
      ],
      names,
      rosterUids: [],
      classId: '',
      now: NOW,
    });
    expect(rows.map((r) => r.bucket)).toEqual(['done', 'inProgress']);
  });

  it('filters responses to the picked class without listing their students as Not started', () => {
    const rows = buildWritingMonitorRows({
      responses: [response('u1', { classId: 'b', saveCount: 1 })],
      names,
      rosterUids: ['u1', 'u2'],
      classId: 'a',
      now: NOW,
    });
    expect(rows.map((r) => r.key)).toEqual(['u2']);
  });

  it('flags idle writers with no save for two minutes, and carries time away', () => {
    const rows = buildWritingMonitorRows({
      responses: [
        response('u1', {
          saveCount: 3,
          summary: {
            ...response('u1').summary,
            savedAt: NOW - WRITING_IDLE_MS - 60_000,
            awayMs: 72_000,
            awayCount: 2,
          },
        }),
        response('u2', { saveCount: 3 }),
      ],
      names,
      rosterUids: [],
      classId: '',
      now: NOW,
    });
    const zed = rows.find((r) => r.key === 'u1');
    expect(zed?.idleMs).toBe(WRITING_IDLE_MS + 60_000);
    expect(zed?.awayCount).toBe(2);
    expect(rows.find((r) => r.key === 'u2')?.idleMs).toBeNull();
  });

  it('shows an unnamed student as Student, after the named ones', () => {
    const rows = buildWritingMonitorRows({
      responses: [response('zz'), response('u2')],
      names,
      rosterUids: [],
      classId: '',
      now: NOW,
    });
    expect(rows.map((r) => r.name)).toEqual(['Bo Adams', 'Student']);
  });
});

describe('savedAgo', () => {
  it('reads in minutes, then hours, then a date', () => {
    expect(savedAgo(null, NOW)).toBeNull();
    expect(savedAgo(NOW - 20_000, NOW)).toBe('Saved just now');
    expect(savedAgo(NOW - 5 * 60_000, NOW)).toBe('Saved 5 min ago');
    expect(savedAgo(NOW - 3 * 3_600_000, NOW)).toBe('Saved 3 hr ago');
  });
});

describe('buildWritingMonitorRows clock', () => {
  it('times saves by when this tab saw them, and never past now', () => {
    const ahead = response('u1', {
      saveCount: 2,
      summary: { ...response('u1').summary, savedAt: NOW + 5 * 60_000 },
    });
    const [row] = buildWritingMonitorRows({
      responses: [ahead],
      names,
      rosterUids: [],
      classId: '',
      now: NOW,
    });
    expect(row.savedAt).toBe(NOW);
    const [seen] = buildWritingMonitorRows({
      responses: [ahead],
      names,
      rosterUids: [],
      classId: '',
      now: NOW,
      seenAt: { u1: NOW - 3 * 60_000 },
    });
    expect(seen.idleMs).toBe(3 * 60_000);
  });
});
