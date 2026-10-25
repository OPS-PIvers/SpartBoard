import { describe, expect, it } from 'vitest';
import { staleMirrors } from './remove-non-operator-admin-mirrors.mjs';

const doc = (id: string, data: Record<string, unknown>) => ({ id, data });

describe('staleMirrors', () => {
  it('selects only synced docs mirrored from a non-operator org', () => {
    const docs = [
      doc('a', { source: 'organizationMembersSync', orgId: 'other-org' }),
      doc('b', { source: 'organizationMembersSync', orgId: 'orono' }),
      doc('c', { orgId: 'other-org' }),
      doc('d', { source: 'manual', orgId: 'other-org' }),
      doc('e', { source: 'organizationMembersSync' }),
    ];
    expect(staleMirrors(docs).map((d) => d.id)).toEqual(['a']);
  });
});
