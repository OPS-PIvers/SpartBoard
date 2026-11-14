import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  live: undefined as Record<string, unknown> | undefined,
  sets: [] as Array<[string, unknown, unknown]>,
  deletes: [] as string[],
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (x: string) => ({ op: 'union', x }),
    arrayRemove: (x: string) => ({ op: 'remove', x }),
  },
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_o: unknown, fn: unknown) => fn,
}));
vi.mock('./firebaseAdmin', () => {
  const docRef = (path: string) => ({
    get: () => Promise.resolve({ exists: !!h.live, data: () => h.live }),
    set: (d: unknown, o: unknown) => {
      h.sets.push([path, d, o]);
      return Promise.resolve();
    },
    delete: () => {
      h.deletes.push(path);
      return Promise.resolve();
    },
  });
  return {
    apps: [1],
    firestore: () => ({
      doc: docRef,
      collection: (c: string) => ({
        doc: (id: string) => docRef(`${c}/${id}`),
      }),
    }),
  };
});

import { betaEmails, publicView, sync } from './permissionMirrors';

describe('sync', () => {
  beforeEach(() => {
    h.sets = [];
    h.deletes = [];
  });

  it('mirrors the live doc, not the stale event, and recomputes grants', async () => {
    h.live = { featureId: 'x', enabled: false, betaUsers: ['A@b.org'] };
    await sync(
      'feature',
      'x',
      { betaUsers: ['a@b.org', 'gone@b.org'] },
      { enabled: true, betaUsers: ['a@b.org'] }
    );
    const mirror = h.sets.find(([p]) => p === 'feature_permissions_public/x');
    expect(mirror?.[1]).toEqual({
      featureId: 'x',
      enabled: false,
      betaUsers: [],
    });
    const grants = Object.fromEntries(
      h.sets
        .filter(([p]) => p.startsWith('beta_grants/'))
        .map(([p, d]) => [p, d])
    );
    expect(grants['beta_grants/a@b.org']).toEqual({
      features: { op: 'union', x: 'x' },
    });
    expect(grants['beta_grants/gone@b.org']).toEqual({
      features: { op: 'remove', x: 'x' },
    });
  });

  it('re-asserts the grant when an email is in both before and after', async () => {
    h.live = { betaUsers: ['a@b.org'] };
    await sync('global', 'g', { betaUsers: ['a@b.org'] }, h.live);
    expect(h.sets.find(([p]) => p === 'beta_grants/a@b.org')?.[1]).toEqual({
      global: { op: 'union', x: 'g' },
    });
  });

  it('deletes the mirror when the source is gone', async () => {
    h.live = undefined;
    await sync('feature', 'x', { betaUsers: ['a@b.org'] }, undefined);
    expect(h.deletes).toEqual(['feature_permissions_public/x']);
    expect(h.sets.find(([p]) => p === 'beta_grants/a@b.org')?.[1]).toEqual({
      features: { op: 'remove', x: 'x' },
    });
  });
});

describe('permissionMirrors', () => {
  it('publicView drops every beta email but keeps config', () => {
    const v = publicView({
      featureId: 'x',
      betaUsers: ['a@b.org'],
      config: { k: 1 },
    });
    expect(v).toEqual({ featureId: 'x', betaUsers: [], config: { k: 1 } });
  });

  it('betaEmails lowercases, trims and dedupes, ignoring junk', () => {
    expect(
      betaEmails({ betaUsers: [' A@b.org', 'a@b.org', 3, '', 'c@d.org'] })
    ).toEqual(['a@b.org', 'c@d.org']);
    expect(betaEmails(undefined)).toEqual([]);
    expect(betaEmails({ betaUsers: 'nope' })).toEqual([]);
  });
});
