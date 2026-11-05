import { afterEach, describe, expect, it, vi } from 'vitest';

const { FakeTimestamp, FakeGeoPoint } = vi.hoisted(() => ({
  FakeTimestamp: class {
    constructor(
      public seconds: number,
      public nanoseconds: number
    ) {}
  },
  FakeGeoPoint: class {
    constructor(
      public latitude: number,
      public longitude: number
    ) {}
  },
}));

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(
    vi.fn(() => ({ doc: (path: string) => ({ path }) })),
    { Timestamp: FakeTimestamp, GeoPoint: FakeGeoPoint }
  ),
}));

vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_opts: unknown, handler: unknown) => handler),
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

import {
  CONFIG_COLLECTIONS,
  currentProjectId,
  DEV_OVERRIDES,
  fromRestFields,
  readProdConfig,
  readProdTree,
  SYNCED_USER_COLLECTIONS,
  syncConfigFromProdV1,
  syncMyMaterialsFromProdV1,
} from './devSyncFromProd';

const swap = (s: string) => s.split('prod-uid').join('dev-uid');

describe('fromRestFields', () => {
  it('converts every REST value type and swaps the prod uid', () => {
    const out = fromRestFields(
      {
        owner: { stringValue: 'prod-uid' },
        path: { stringValue: 'users/prod-uid/pdfs/a' },
        n: { integerValue: '42' },
        d: { doubleValue: 1.5 },
        b: { booleanValue: false },
        z: { nullValue: null },
        at: { timestampValue: '2026-09-21T20:44:53.570525Z' },
        ref: {
          referenceValue:
            'projects/spartboard/databases/(default)/documents/users/prod-uid/dashboards/x',
        },
        geo: { geoPointValue: { latitude: 44.9, longitude: -93.5 } },
        list: {
          arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '1' }] },
        },
        empty: { arrayValue: {} },
        nested: {
          mapValue: { fields: { 'prod-uid': { booleanValue: true } } },
        },
      },
      swap
    );

    expect(out.owner).toBe('dev-uid');
    expect(out.path).toBe('users/dev-uid/pdfs/a');
    expect(out.n).toBe(42);
    expect(out.d).toBe(1.5);
    expect(out.b).toBe(false);
    expect(out.z).toBeNull();
    expect(out.at).toEqual(new FakeTimestamp(1790023493, 570525000));
    expect(out.ref).toEqual({ path: 'users/dev-uid/dashboards/x' });
    expect(out.geo).toEqual(new FakeGeoPoint(44.9, -93.5));
    expect(out.list).toEqual(['a', 1]);
    expect(out.empty).toEqual([]);
    expect(out.nested).toEqual({ 'dev-uid': true });
  });
});

describe('SYNCED_USER_COLLECTIONS', () => {
  it('never copies credential, student-work or emailing collections', () => {
    for (const name of [
      'private',
      'quiz_assignments',
      'paper_batches',
      'group_email_alerts',
      'mcp_grants',
    ]) {
      expect(SYNCED_USER_COLLECTIONS).not.toContain(name);
    }
  });

  it("copies the teacher's classes and personal settings", () => {
    for (const name of [
      'rosters',
      'userProfile',
      'gradebook_settings',
      'plc_layouts',
    ]) {
      expect(SYNCED_USER_COLLECTIONS).toContain(name);
    }
  });
});

describe('readProdConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads every config collection and keeps only admin, non-student members', async () => {
    const base = 'projects/spartboard/databases/(default)/documents/';
    const t = '2026-09-22T00:00:00Z';
    const doc = (path: string, fields: Record<string, unknown> = {}) => ({
      name: base + path,
      createTime: t,
      fields,
    });
    const pages: Record<string, unknown[]> = {
      admins: [doc('admins/boss@x.org')],
      admin_settings: [doc('admin_settings/a')],
      organizations: [doc('organizations/orono')],
      'organizations/orono/buildings': [
        doc('organizations/orono/buildings/hs'),
      ],
      'organizations/orono/members': [
        doc('organizations/orono/members/boss@x.org', {
          email: { stringValue: 'Boss@x.org' },
          roleId: { stringValue: 'teacher' },
        }),
        doc('organizations/orono/members/kid@x.org', {
          roleId: { stringValue: 'student' },
        }),
        doc('organizations/orono/members/staff@x.org', {
          roleId: { stringValue: 'teacher' },
        }),
      ],
    };
    const listed: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const path = decodeURIComponent(
          url.split('/documents/')[1].split('?')[0]
        );
        listed.push(path);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ documents: pages[path] ?? [] }),
        });
      })
    );

    const { orgs, plan } = await readProdConfig('tok');

    for (const name of CONFIG_COLLECTIONS) expect(listed).toContain(name);
    expect(orgs).toHaveLength(1);
    const byPath = new Map(plan.map((p) => [p.path, p]));
    expect(byPath.get('admins')?.prune).toBe(false);
    expect(byPath.get('admin_settings')?.prune).toBe(true);
    expect(byPath.get('organizations/orono/buildings')?.docs).toHaveLength(1);
    const members = byPath.get('organizations/orono/members');
    expect(members?.prune).toBe(false);
    expect(members?.docs.map((d) => d.name.split('/').pop())).toEqual([
      'boss@x.org',
    ]);
  });
});

describe('syncConfigFromProdV1', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses to run outside the dev project', async () => {
    process.env.GCLOUD_PROJECT = 'spartboard';
    const handler = syncConfigFromProdV1 as unknown as (
      req: unknown
    ) => Promise<unknown>;
    await expect(
      handler({ auth: { uid: 'u', token: {} } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('forces ClassLink sync off', () => {
    expect(DEV_OVERRIDES['admin_settings/classlink_sync']).toEqual({
      enabled: false,
    });
  });
});

describe('SYNCED_USER_COLLECTIONS folders', () => {
  it('carries every folder tree whose items are synced', () => {
    for (const name of [
      'quiz_folders',
      'question_bank_folders',
      'video_activity_folders',
      'guided_learning_folders',
      'miniapp_folders',
      'projects_folders',
      'flashcard_folders',
    ]) {
      expect(SYNCED_USER_COLLECTIONS).toContain(name);
    }
  });
});

describe('readProdTree', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('walks a dashboard down to its drawing objects, keeping missing parents as path-only', async () => {
    const base = 'projects/spartboard/databases/(default)/documents/';
    const t = '2026-09-22T00:00:00Z';
    const pages: Record<string, unknown[]> = {
      'users/p/dashboards': [
        { name: base + 'users/p/dashboards/b1', createTime: t, fields: {} },
      ],
      'users/p/dashboards/b1/drawings': [
        { name: base + 'users/p/dashboards/b1/drawings/w1' },
      ],
      'users/p/dashboards/b1/drawings/w1/pages': [
        {
          name: base + 'users/p/dashboards/b1/drawings/w1/pages/pg1',
          createTime: t,
          fields: {},
        },
      ],
      'users/p/dashboards/b1/drawings/w1/pages/pg1/objects': [
        {
          name: base + 'users/p/dashboards/b1/drawings/w1/pages/pg1/objects/o1',
          createTime: t,
          fields: {},
        },
      ],
    };
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url);
        const path = decodeURIComponent(
          url.split('/documents/')[1].split('?')[0]
        );
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ documents: pages[path] ?? [] }),
        });
      })
    );

    const entries = await readProdTree(
      'tok',
      'users/p/dashboards',
      'dashboards'
    );

    expect(entries.map((e) => [e.path, e.fields === null])).toEqual([
      ['users/p/dashboards/b1', false],
      ['users/p/dashboards/b1/drawings/w1', true],
      ['users/p/dashboards/b1/drawings/w1/pages/pg1', false],
      ['users/p/dashboards/b1/drawings/w1/pages/pg1/objects/o1', false],
    ]);
    expect(urls.find((u) => u.includes('/drawings?'))).toContain(
      'showMissing=true'
    );
  });
});

describe('syncMyMaterialsFromProdV1', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('falls back to FIREBASE_CONFIG when GCLOUD_PROJECT is unset (gen2)', () => {
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    process.env.FIREBASE_CONFIG = JSON.stringify({
      projectId: 'spartboard-dev',
    });
    expect(currentProjectId()).toBe('spartboard-dev');
  });

  it('refuses to run outside the dev project', async () => {
    process.env.GCLOUD_PROJECT = 'spartboard';
    const handler = syncMyMaterialsFromProdV1 as unknown as (
      req: unknown
    ) => Promise<unknown>;
    await expect(
      handler({ auth: { uid: 'u', token: {} } })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});
