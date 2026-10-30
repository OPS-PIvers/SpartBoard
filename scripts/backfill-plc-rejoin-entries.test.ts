import { describe, expect, it } from 'vitest';
import { resetEntry, staleRejoinUids } from './backfill-plc-rejoin-entries.mjs';

describe('staleRejoinUids', () => {
  it('selects only current members whose map entry is still removed', () => {
    const plc = {
      memberUids: ['a', 'b', 'c'],
      members: {
        a: { role: 'coLead', status: 'removed' },
        b: { role: 'member', status: 'active' },
        d: { role: 'member', status: 'removed' },
      },
    };
    expect(staleRejoinUids(plc)).toEqual(['a']);
  });

  it('never selects the lead', () => {
    const plc = {
      leadUid: 'l',
      memberUids: ['l', 'x'],
      members: {
        l: { role: 'member', status: 'removed' },
        x: { role: 'lead', status: 'removed' },
      },
    };
    expect(staleRejoinUids(plc)).toEqual([]);
  });

  it('tolerates legacy array-only and empty PLCs', () => {
    expect(staleRejoinUids({ memberUids: ['a'] })).toEqual([]);
    expect(staleRejoinUids({})).toEqual([]);
    expect(staleRejoinUids(undefined)).toEqual([]);
  });
});

describe('resetEntry', () => {
  it('makes the entry an active member and keeps its other keys', () => {
    expect(
      resetEntry({
        uid: 'a',
        email: 'a@x.org',
        role: 'coLead',
        status: 'removed',
      })
    ).toEqual({ uid: 'a', email: 'a@x.org', role: 'member', status: 'active' });
  });
});
