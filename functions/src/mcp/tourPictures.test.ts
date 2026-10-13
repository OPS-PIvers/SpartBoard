import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type * as admin from 'firebase-admin';

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  saved: [] as { path: string; contentType?: string }[],
  admin: true,
  set: null as Record<string, unknown> | null,
  saveSet: vi.fn(),
}));

vi.mock('firebase-admin', () => ({
  apps: [{}],
  storage: () => ({
    bucket: () => ({
      name: 'bucket',
      file: (path: string) => ({
        save: (_b: Buffer, opts: { contentType?: string }) => {
          h.saved.push({ path, contentType: opts.contentType });
          return Promise.resolve();
        },
      }),
    }),
  }),
}));

vi.mock('../glMediaReferences', () => ({ GL_MEDIA_MARKER: 'glMedia' }));

vi.mock('./glTools', () => ({
  isAdmin: () => Promise.resolve(h.admin),
  loadSet: () => Promise.resolve({ set: h.set, source: 'building' }),
  saveSet: h.saveSet,
}));

import {
  issuePictureTicket,
  savePictures,
  PICTURE_TICKET_MS,
} from './tourPictures';

const docAt = (path: string) => ({
  get: () => {
    const data = h.docs.get(path);
    return Promise.resolve({
      exists: !!data,
      data: () => data,
      get: (k: string) => data?.[k],
    });
  },
  set: (data: Record<string, unknown>) => {
    h.docs.set(path, data);
    return Promise.resolve();
  },
});
const db = {
  doc: docAt,
  collection: (c: string) => ({ doc: (id: string) => docAt(`${c}/${id}`) }),
} as unknown as admin.firestore.Firestore;

const ctx = { db, uid: 'u1', email: 'a@b.org', grantId: 'g1' };
const png = `data:image/png;base64,${Buffer.from('png').toString('base64')}`;

beforeEach(() => {
  h.docs.clear();
  h.saved = [];
  h.admin = true;
  h.saveSet.mockReset();
  h.docs.set('users/u1/mcp_grants/g1', {});
  h.set = {
    id: 'tour-1',
    mode: 'tour',
    steps: [
      { id: 'a', tour: { anchor: 'board.whole', action: 'observe' } },
      { id: 'b', text: 'Plain' },
    ],
  };
});

describe('live tour step pictures', () => {
  it('stores only a hash of the ticket and an expiry', async () => {
    const out = await issuePictureTicket(ctx, 'tour-1', 1000);
    expect(out.upload_url).toMatch(/\/mcp\/tour-pictures$/);
    const id = createHash('sha256').update(out.ticket).digest('hex');
    expect(h.docs.get(`mcp_tour_picture_tickets/${id}`)).toEqual({
      uid: 'u1',
      email: 'a@b.org',
      grantId: 'g1',
      setId: 'tour-1',
      expiresAt: 1000 + PICTURE_TICKET_MS,
    });
  });

  it('saves each picture as its step thumbnail and skips steps without a control', async () => {
    const { ticket } = await issuePictureTicket(ctx, 'tour-1', 1000);
    const out = await savePictures(
      db,
      {
        ticket,
        pictures: [
          { step_id: 'a', image: png, w: 640, h: 360 },
          { step_id: 'b', image: png, w: 640, h: 360 },
          { step_id: 'zz', image: png, w: 640, h: 360 },
        ],
      },
      2000
    );
    expect(out.saved).toEqual(['a']);
    expect(out.skipped.map((s) => s.step_id)).toEqual(['b', 'zz']);
    expect(h.saved).toEqual([
      {
        path: 'users/u1/hotspot_images/2000-tour-1.png',
        contentType: 'image/png',
      },
    ]);
    const next = h.saveSet.mock.calls[0][2] as {
      steps: { tour?: { thumbnail?: Record<string, unknown> } }[];
    };
    expect(next.steps[0].tour?.thumbnail).toMatchObject({
      anchor: 'board.whole',
      w: 640,
      h: 360,
    });
    expect(next.steps[0].tour?.thumbnail?.url).toContain(
      encodeURIComponent('users/u1/hotspot_images/2000-tour-1.png')
    );
  });

  it('refuses an expired ticket, a revoked grant and a non-admin', async () => {
    const { ticket } = await issuePictureTicket(ctx, 'tour-1', 1000);
    const body = {
      ticket,
      pictures: [{ step_id: 'a', image: png, w: 1, h: 1 }],
    };
    await expect(
      savePictures(db, body, 1000 + PICTURE_TICKET_MS + 1)
    ).rejects.toThrow(/expired/);
    h.docs.set('users/u1/mcp_grants/g1', { revokedAt: 5 });
    await expect(savePictures(db, body, 2000)).rejects.toThrow(/disconnected/);
    h.docs.set('users/u1/mcp_grants/g1', {});
    h.admin = false;
    await expect(savePictures(db, body, 2000)).rejects.toThrow(/admins/);
    expect(h.saveSet).not.toHaveBeenCalled();
  });
});
