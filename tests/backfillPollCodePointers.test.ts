import { describe, expect, it } from 'vitest';
import { missingPointers } from '@/scripts/backfill-poll-code-pointers.mjs';

describe('backfill-poll-code-pointers missingPointers', () => {
  it('points live codes at their session and parks codes only retired sessions hold', () => {
    const retired = { active: false, questions: [], updatedAt: 5 };
    const out = missingPointers(
      [
        { id: 't1_LIVE1', data: { active: true, questions: [{}] } },
        { id: 't1_IDLE1', data: retired },
        { id: 't2_IDLE1', data: { ...retired, updatedAt: 9 } },
        { id: 't3_LIVE1', data: retired },
        { id: 't4_HAVE1', data: retired },
      ],
      new Set(['HAVE1'])
    );
    expect(out).toEqual([
      { code: 'LIVE1', sessionId: 't1_LIVE1', teacherUid: 't1' },
      { code: 'IDLE1', teacherUid: 't2' },
    ]);
  });
});
