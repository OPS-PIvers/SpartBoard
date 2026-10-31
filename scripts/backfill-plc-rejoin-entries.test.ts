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
  it('writes only the keys acceptInvite writes, dropping stale ones', () => {
    expect(
      resetEntry(
        'a',
        {
          uid: 'a',
          email: 'old@x.org',
          displayName: 'Ann',
          role: 'coLead',
          status: 'removed',
          addedBy: 'autoRoster',
          mentorRole: 'mentor',
        },
        'A@X.org',
        'now'
      )
    ).toEqual({
      uid: 'a',
      email: 'a@x.org',
      displayName: 'Ann',
      role: 'member',
      status: 'active',
      joinedAt: 'now',
    });
  });

  it('falls back to the entry email and its local part for the name', () => {
    expect(resetEntry('b', { email: 'b@x.org' }, undefined, 1)).toEqual({
      uid: 'b',
      email: 'b@x.org',
      displayName: 'b',
      role: 'member',
      status: 'active',
      joinedAt: 1,
    });
  });
});
