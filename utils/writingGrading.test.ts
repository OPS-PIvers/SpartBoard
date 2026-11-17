import { describe, expect, it } from 'vitest';
import type { Rubric, WritingResponse } from '@/types';
import {
  buildWritingRows,
  formatWritingScore,
  sortDraftsNewestFirst,
  writingCallReason,
  writingMaxPoints,
} from './writingGrading';

const response = (
  studentUid: string,
  patch: Partial<WritingResponse> = {}
): WritingResponse => ({
  studentUid,
  classId: 'c1',
  html: '',
  status: 'draft',
  saveCount: 1,
  tabId: 't',
  logChunk: 0,
  startedAt: 1,
  draftCount: 0,
  updatedAt: 1,
  summary: {} as WritingResponse['summary'],
  ...patch,
});

const rubric = {
  id: 'r',
  criteria: [
    { id: 'a', levels: [{ points: 1 }, { points: 4 }] },
    { id: 'b', levels: [{ points: 3 }] },
  ],
} as unknown as Rubric;

describe('buildWritingRows', () => {
  it('lists every named student as "Last, First" by last name, then unnamed responses', () => {
    const rows = buildWritingRows(
      [response('u2', { status: 'turned-in' }), response('zz')],
      new Map([
        ['u1', { givenName: 'Ana', familyName: 'Zeller' }],
        ['u2', { givenName: 'Bo', familyName: 'Adams' }],
      ])
    );
    expect(rows.map((r) => [r.name, r.state])).toEqual([
      ['Adams, Bo', 'turned-in'],
      ['Zeller, Ana', 'not-started'],
      ['Student 1', 'draft'],
    ]);
  });
});

describe('scores', () => {
  it('counts a rubric total from each criterion top level', () => {
    expect(
      writingMaxPoints({
        mode: 'rubric',
        rubricId: 'r',
        rubricSnapshot: rubric,
      })
    ).toBe(7);
    expect(writingMaxPoints({ mode: 'points', points: 20 })).toBe(20);
    expect(writingMaxPoints({ mode: 'ungraded' })).toBeNull();
    expect(
      writingMaxPoints({
        mode: 'rubric',
        rubricId: 'r',
        rubricSnapshot: { criteria: [] } as unknown as Rubric,
      })
    ).toBeNull();
  });

  it('formats a score, an excused piece, and nothing', () => {
    expect(formatWritingScore({ pointsAwarded: 18 }, 20)).toBe('18 / 20');
    expect(formatWritingScore({ excused: true }, 20)).toBe('Excused');
    expect(formatWritingScore(undefined, 20)).toBeNull();
    expect(formatWritingScore({}, 20)).toBeNull();
  });
});

describe('helpers', () => {
  it('orders copies newest first and reads a refusal reason', () => {
    expect(
      sortDraftsNewestFirst([
        { number: 1, seq: 1 },
        { number: 2, seq: 3 },
      ]).map((d) => d.seq)
    ).toEqual([3, 1]);
    expect(writingCallReason({ details: { reason: 'taken-back' } })).toBe(
      'taken-back'
    );
    expect(writingCallReason(new Error('x'))).toBeNull();
  });
});
